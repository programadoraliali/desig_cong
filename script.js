// --- Configuração Inicial ---

let membros = []; // Array para armazenar os objetos de membro em memória
let membroModal; // Referência ao objeto Modal do Bootstrap para adicionar/editar individualmente
let massaModal; // Referência ao objeto Modal do Bootstrap para adicionar em massa
let designacoesMensaisCache = {}; // Cache para evitar recalcular se nada mudar
let isGerando = false; // Flag para evitar cliques múltiplos no botão Gerar
let confirmacaoLimparModal; // Referência ao modal de confirmação de limpeza

// --- Configuração do IndexedDB ---
const DB_NAME = 'CongregacaoDB';
const DB_VERSION = 1; // Incrementar se a estrutura mudar
const STORE_NAME = 'membros';
let db; // Referência para o banco de dados IndexedDB

/**
 * Abre (ou cria/atualiza) o banco de dados IndexedDB.
 * @returns {Promise<IDBDatabase>} Uma promessa que resolve com a instância do banco de dados.
 */
function abrirBancoDeDados() {
    return new Promise((resolve, reject) => {
        // Verifica se o IndexedDB é suportado
        if (!window.indexedDB) {
            console.error("IndexedDB não é suportado neste navegador.");
            alert("Seu navegador não suporta IndexedDB, que é necessário para salvar os dados localmente de forma segura. Os dados não serão salvos.");
            return reject(new Error("IndexedDB não suportado."));
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("Erro ao abrir o banco de dados:", event.target.error);
            reject(new Error(`Erro ao abrir IndexedDB: ${event.target.error}`));
        };

        request.onsuccess = (event) => {
            console.log("Banco de dados IndexedDB aberto com sucesso.");
            db = event.target.result; // Armazena a referência do banco de dados
            resolve(db);
        };

        // Chamado se a versão do banco de dados mudar ou se ele for criado pela primeira vez
        request.onupgradeneeded = (event) => {
            console.log("Atualizando ou criando o banco de dados IndexedDB...");
            const tempDb = event.target.result;
            // Cria o object store (tabela) se não existir
            if (!tempDb.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = tempDb.createObjectStore(STORE_NAME, { keyPath: 'id' });
                // Cria índices para busca (opcional, mas útil)
                objectStore.createIndex('nome', 'nome', { unique: true }); // Garante nomes únicos
                console.log(`Object store "${STORE_NAME}" criado.`);
            } else {
                console.log(`Object store "${STORE_NAME}" já existe.`);
                // Aqui você pode adicionar lógica para migrar dados de versões antigas se necessário
            }
            console.log("Atualização/criação do IndexedDB concluída.");
        };
    });
}

// --- Funções de Persistência (IndexedDB) ---

/**
 * Salva todos os membros da memória para o IndexedDB.
 * Limpa o store e insere todos os membros atuais.
 * @returns {Promise<void>}
 */
async function salvarMembrosLocalmente() {
    if (!db) {
        console.error("Banco de dados não está aberto. Não é possível salvar.");
        alert("Erro: O banco de dados não está acessível. Não foi possível salvar.");
        return;
    }
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        // Limpa o store antes de adicionar tudo (garante consistência com o array 'membros')
        const clearRequest = store.clear();

        clearRequest.onsuccess = () => {
            console.log("Store limpo, adicionando membros atuais...");
            let count = 0;
            // Adiciona cada membro do array 'membros' ao store
            membros.forEach(membro => {
                const addRequest = store.add(membro);
                addRequest.onsuccess = () => {
                    count++;
                    if (count === membros.length) {
                        // Resolvido quando o último membro for adicionado
                    }
                };
                addRequest.onerror = (event) => {
                    console.error(`Erro ao adicionar membro ${membro.nome} (ID: ${membro.id}):`, event.target.error);
                    // Não rejeita imediatamente, tenta adicionar os outros
                };
            });
        };
        clearRequest.onerror = (event) => {
            console.error("Erro ao limpar o store:", event.target.error);
            reject(new Error(`Erro ao limpar IndexedDB: ${event.target.error}`));
        };


        transaction.oncomplete = () => {
            console.log(`Dados salvos no IndexedDB (${membros.length} membros).`);
            resolve();
        };

        transaction.onerror = (event) => {
            console.error("Erro na transação de salvamento:", event.target.error);
            alert("Ocorreu um erro ao salvar os dados no banco de dados local.");
            reject(new Error(`Erro na transação IndexedDB: ${event.target.error}`));
        };
    });
}

/**
 * Carrega todos os membros do IndexedDB para o array 'membros' em memória.
 * @returns {Promise<void>}
 */
async function carregarMembrosLocalmente() {
    if (!db) {
        console.error("Banco de dados não está aberto. Não é possível carregar.");
        // Tenta abrir novamente em caso de falha inicial
        try {
            await abrirBancoDeDados();
            if (!db) throw new Error("Falha ao reabrir o BD.");
        } catch (error) {
            alert("Erro crítico: Não foi possível acessar o banco de dados local para carregar os membros.");
            membros = []; // Inicia vazio se não conseguir carregar
            return;
        }
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const getAllRequest = store.getAll(); // Pega todos os registros

        getAllRequest.onsuccess = (event) => {
            const membrosSalvos = event.target.result;
            if (membrosSalvos && membrosSalvos.length > 0) {
                // Processa e valida os membros carregados
                membros = membrosSalvos.map(m => validarEstruturaMembro(m, true)); // Valida ao carregar
                console.log(`Dados carregados do IndexedDB: ${membros.length} membros.`);
            } else {
                console.log("Nenhum dado salvo encontrado no IndexedDB. Iniciando com lista vazia.");
                membros = [];
            }
            resolve();
        };

        getAllRequest.onerror = (event) => {
            console.error("Erro ao carregar dados do IndexedDB:", event.target.error);
            alert("Erro ao carregar dados salvos. Iniciando com lista vazia.");
            membros = []; // Garante que 'membros' seja um array vazio em caso de erro
            reject(new Error(`Erro ao ler IndexedDB: ${event.target.error}`));
        };
    });
}

/**
 * Valida e normaliza a estrutura de um objeto de membro.
 * @param {object} membro O objeto do membro a ser validado.
 * @param {boolean} gerarIdSeAusente Se true, gera um ID caso não exista.
 * @returns {object} O objeto do membro validado e normalizado.
 */
function validarEstruturaMembro(membro, gerarIdSeAusente = false) {
    const membroValidado = { ...membro }; // Cria uma cópia

    if (gerarIdSeAusente && !membroValidado.id) {
        membroValidado.id = `membro_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        console.warn(`Membro sem ID encontrado. Gerando novo ID: ${membroValidado.id}`);
    }
    membroValidado.nome = typeof membroValidado.nome === 'string' ? membroValidado.nome.trim() : 'Nome Inválido';
    membroValidado.permissoesBase = (typeof membroValidado.permissoesBase === 'object' && membroValidado.permissoesBase !== null) ? membroValidado.permissoesBase : {};
    membroValidado.historicoDesignacoes = validarHistoricoImportado(membroValidado.historicoDesignacoes); // Reusa a função de validação
    membroValidado.impedimentos = Array.isArray(membroValidado.impedimentos)
        ? membroValidado.impedimentos.filter(imp => typeof imp === 'string' && imp.match(/^\d{4}-\d{2}$/))
        : [];

    // Garante que as permissões usem apenas chaves válidas
    const permissoesValidas = {};
    const idsPermissoesValidas = PERMISSOES_BASE.map(p => p.id);
    for (const key in membroValidado.permissoesBase) {
        if (idsPermissoesValidas.includes(key)) {
            permissoesValidas[key] = !!membroValidado.permissoesBase[key]; // Garante booleano
        } else {
            console.warn(`Permissão inválida "${key}" encontrada no membro "${membroValidado.nome}" e removida.`);
        }
    }
    membroValidado.permissoesBase = permissoesValidas;


    return membroValidado;
}


// --- Funções do Modal de Membro (Individual) ---

function inicializarModal() {
    const modalElement = document.getElementById('membroModal');
    if (modalElement) {
        membroModal = new bootstrap.Modal(modalElement);
        // Limpar campos ao fechar o modal
        modalElement.addEventListener('hidden.bs.modal', () => {
            document.getElementById('formMembro').reset();
            document.getElementById('membroId').value = '';
            document.getElementById('membroModalLabel').textContent = 'Adicionar Novo Membro';
            renderizarListaImpedimentos([]);
            const checkboxes = document.querySelectorAll('#permissoesContainer input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = false);
        });
    } else {
        console.error("Elemento do modal 'membroModal' não encontrado.");
    }

    // Inicializar modal de confirmação de limpeza
    const confirmModalElement = document.getElementById('confirmacaoLimparModal');
    if (confirmModalElement) {
        confirmacaoLimparModal = new bootstrap.Modal(confirmModalElement);
    } else {
        console.error("Elemento do modal 'confirmacaoLimparModal' não encontrado.");
    }
}

function abrirModalNovoMembro() {
    document.getElementById('membroModalLabel').textContent = 'Adicionar Novo Membro';
    renderizarPermissoesModal();
    renderizarListaImpedimentos([]);
    if (membroModal) membroModal.show();
}

function abrirModalEditarMembro(idMembro) {
    const membro = membros.find(m => m.id === idMembro);
    if (!membro) {
        console.error(`Membro com ID ${idMembro} não encontrado para edição.`);
        alert("Erro: Membro não encontrado.");
        return;
    }

    document.getElementById('membroModalLabel').textContent = 'Editar Membro';
    document.getElementById('membroId').value = membro.id;
    document.getElementById('nomeMembro').value = membro.nome;

    renderizarPermissoesModal(membro.permissoesBase || {});
    renderizarListaImpedimentos(membro.impedimentos || []);

    if (membroModal) membroModal.show();
}

async function salvarMembro() { // Função agora é async devido ao salvamento no DB
    const id = document.getElementById('membroId').value;
    const nome = document.getElementById('nomeMembro').value.trim();

    if (!nome) {
        alert('Por favor, insira o nome do membro.');
        return;
    }

    // Verifica se já existe membro com o mesmo nome (ignorando caso seja edição do próprio membro)
    const nomeExistente = membros.some(m => m.nome.toLowerCase() === nome.toLowerCase() && m.id !== id);
    if (nomeExistente) {
        alert(`Já existe um membro cadastrado com o nome "${nome}". Por favor, use um nome diferente ou edite o membro existente.`);
        return;
    }

    const permissoesBase = {};
    document.querySelectorAll('#permissoesContainer input[type="checkbox"]').forEach(checkbox => {
        permissoesBase[checkbox.value] = checkbox.checked;
    });

    const impedimentos = [];
    document.querySelectorAll('#listaImpedimentos li').forEach(item => {
        impedimentos.push(item.dataset.impedimento);
    });

    let membroAtualizado;

    if (id) { // Editando membro existente
        const index = membros.findIndex(m => m.id === id);
        if (index !== -1) {
            membros[index].nome = nome;
            membros[index].permissoesBase = permissoesBase;
            membros[index].impedimentos = impedimentos;
            // Valida a estrutura antes de salvar (redundante mas seguro)
            membros[index] = validarEstruturaMembro(membros[index]);
            membroAtualizado = membros[index];
        } else {
            console.error(`Erro: Membro com ID ${id} não encontrado no array 'membros' para edição.`);
            alert("Erro ao salvar: Membro não encontrado.");
            return;
        }
    } else { // Adicionando novo membro
        const novoMembroBase = {
            // ID será gerado pela função de validação
            nome: nome,
            permissoesBase: permissoesBase,
            historicoDesignacoes: {},
            impedimentos: impedimentos
        };
        // Gera ID e valida a estrutura
        const novoMembro = validarEstruturaMembro(novoMembroBase, true);
        membros.push(novoMembro);
        membroAtualizado = novoMembro;
    }

    try {
        await salvarMembrosLocalmente(); // Salva toda a lista no IndexedDB
        renderizarTabelaMembros();
        if (membroModal) membroModal.hide();
    } catch (error) {
        console.error("Falha ao salvar membro no IndexedDB:", error);
        alert("Ocorreu um erro ao salvar o membro. Verifique o console para mais detalhes.");
        // Considerar reverter a adição/edição no array 'membros' se o salvamento falhar?
        // Por simplicidade, não revertemos aqui, mas poderia ser implementado.
    }
}

async function excluirMembro(idMembro) { // Função agora é async
    const membro = membros.find(m => m.id === idMembro);
    if (!membro) {
        console.error(`Membro com ID ${idMembro} não encontrado para exclusão.`);
        alert("Erro: Membro não encontrado para exclusão.");
        return;
    }

    if (confirm(`Tem certeza que deseja excluir o membro "${membro.nome}"?\nEsta ação não pode ser desfeita.`)) {
        membros = membros.filter(m => m.id !== idMembro); // Remove do array em memória
        try {
            await salvarMembrosLocalmente(); // Salva a lista atualizada no IndexedDB
            renderizarTabelaMembros(); // Atualiza a interface
        } catch (error) {
            console.error("Falha ao excluir membro do IndexedDB:", error);
            alert("Ocorreu um erro ao excluir o membro. A lista pode não ter sido salva corretamente.");
            // Recarregar a lista do DB para garantir consistência?
            await carregarMembrosLocalmente();
            renderizarTabelaMembros();
        }
    }
}

// --- Funções do Modal Adicionar em Massa ---

function inicializarModalMassa() {
    const modalElement = document.getElementById('massaModal');
    if (modalElement) {
        massaModal = new bootstrap.Modal(modalElement);
        // Limpar textarea ao fechar
        modalElement.addEventListener('hidden.bs.modal', () => {
            document.getElementById('nomesMassa').value = '';
        });
    } else {
        console.error("Elemento do modal 'massaModal' não encontrado.");
    }
}

function abrirModalMassa() {
    if (massaModal) massaModal.show();
}

async function salvarMembrosMassa() { // Função agora é async
    const nomesInput = document.getElementById('nomesMassa').value;
    if (!nomesInput.trim()) {
        alert("Por favor, cole a lista de nomes na área indicada.");
        return;
    }

    const nomes = nomesInput.split('\n')
        .map(nome => nome.trim())
        .filter(nome => nome.length > 0);

    if (nomes.length === 0) {
        alert("Nenhum nome válido encontrado na lista.");
        return;
    }

    let adicionados = 0;
    let ignorados = 0;
    const nomesAdicionados = [];
    const novosMembrosParaAdicionar = [];

    nomes.forEach(nome => {
        const nomeExistente = membros.some(m => m.nome.toLowerCase() === nome.toLowerCase());
        if (!nomeExistente) {
            const novoMembroBase = {
                nome: nome,
                permissoesBase: {},
                historicoDesignacoes: {},
                impedimentos: []
            };
            // Valida e gera ID
            const novoMembro = validarEstruturaMembro(novoMembroBase, true);
            novosMembrosParaAdicionar.push(novoMembro);
            adicionados++;
            nomesAdicionados.push(nome);
        } else {
            ignorados++;
            console.warn(`Membro "${nome}" já existe, ignorado.`);
        }
    });

    if (adicionados > 0) {
        // Adiciona os novos membros ao array em memória
        membros.push(...novosMembrosParaAdicionar);
        try {
            await salvarMembrosLocalmente(); // Salva a lista completa no IndexedDB
            renderizarTabelaMembros();
            alert(`${adicionados} membros adicionados com sucesso!\n\nNomes adicionados:\n- ${nomesAdicionados.join('\n- ')}\n\n${ignorados > 0 ? `${ignorados} nomes foram ignorados por já existirem.` : ''}`);
            if (massaModal) massaModal.hide();
        } catch (error) {
            console.error("Falha ao salvar membros em massa no IndexedDB:", error);
            alert("Ocorreu um erro ao salvar os membros em massa. Verifique o console.");
            // Reverter a adição ao array 'membros'?
            membros = membros.filter(m => !novosMembrosParaAdicionar.some(nm => nm.id === m.id));
        }
    } else {
        alert(`Nenhum membro novo adicionado. ${ignorados > 0 ? `${ignorados} nomes foram ignorados por já existirem.` : 'Verifique a lista fornecida.'}`);
    }
}


// --- Funções de Renderização da Interface (sem mudanças significativas, exceto chamadas async) ---

function getBadgeClass(permissaoId) {
    // Mapeamento de IDs de permissão para classes de badge (mantido)
    const map = {
        indicadorQui: 'badge-indicadorQui',
        indicadorDom: 'badge-indicadorDom',
        volanteQui: 'badge-volanteQui',
        volanteDom: 'badge-volanteDom',
        leitor: 'badge-leitor',
        presidente: 'badge-presidente'
    };
    return map[permissaoId] || 'bg-secondary'; // Retorna uma classe padrão se não encontrar
}

function renderizarTabelaMembros() {
    console.log('renderizarTabelaMembros chamada. Número de membros em memória:', membros.length);
    const tbody = document.getElementById('tabelaMembros');
    const contadorNumeroEl = document.getElementById('contadorMembrosNumero');
    const semMembrosAviso = document.getElementById('semMembrosAviso');

    if (!tbody) { console.error("Erro fatal: Elemento 'tabelaMembros' não encontrado."); return; }

    tbody.innerHTML = ''; // Limpa a tabela antes de renderizar

    // Ordena os membros alfabeticamente pelo nome
    membros.sort((a, b) => a.nome.localeCompare(b.nome));

    // Atualiza o contador de membros na interface
    if (contadorNumeroEl) contadorNumeroEl.textContent = membros.length;

    // Mostra ou esconde o aviso de "sem membros"
    if (membros.length === 0) {
        if (semMembrosAviso) semMembrosAviso.classList.remove('d-none');
        return; // Sai da função se não houver membros
    } else {
        if (semMembrosAviso) semMembrosAviso.classList.add('d-none');
    }

    // Itera sobre cada membro para criar uma linha na tabela
    membros.forEach(membro => {
        const tr = document.createElement('tr'); // Cria a linha da tabela (table row)

        // --- Célula do Nome ---
        const tdNome = document.createElement('td'); // Cria a célula do nome (table data)
        const nomeLink = document.createElement('a'); // Cria um link para o nome
        nomeLink.href = '#'; // Link vazio para evitar navegação padrão
        nomeLink.textContent = membro.nome; // Define o texto do link como o nome do membro
        nomeLink.classList.add('nome-membro', 'text-decoration-none'); // Adiciona classes para estilo e identificação
        nomeLink.onclick = (e) => { // Adiciona evento de clique para editar
            e.preventDefault(); // Previne a ação padrão do link
            abrirModalEditarMembro(membro.id); // Abre o modal de edição
        };
        tdNome.appendChild(nomeLink); // Adiciona o link à célula

        // --- Célula de Permissões (Badges) ---
        const tdPermissoes = document.createElement('td'); // Cria a célula para as permissões
        let temAlgumaPermissao = false; // Flag para verificar se o membro tem alguma permissão
        const permissoesContainer = document.createElement('div'); // Cria um container para os badges
        permissoesContainer.classList.add('d-flex', 'flex-wrap', 'gap-1', 'align-items-center'); // Adiciona classes de layout flexbox

        // Itera sobre as permissões base definidas em config.js
        PERMISSOES_BASE.forEach(permissaoMestra => {
            // Verifica se o membro possui a permissão atual
            if (membro.permissoesBase && membro.permissoesBase[permissaoMestra.id]) {
                const badge = document.createElement('span'); // Cria o elemento span para o badge
                // Adiciona classes de estilo do Bootstrap e a classe específica da permissão
                badge.classList.add('badge', 'rounded-pill', 'py-1', 'px-2', getBadgeClass(permissaoMestra.id));
                badge.textContent = permissaoMestra.nome; // Define o texto do badge
                permissoesContainer.appendChild(badge); // Adiciona o badge ao container
                temAlgumaPermissao = true; // Marca que o membro tem pelo menos uma permissão
            }
        });

        // Se o membro não tiver nenhuma permissão, mostra uma mensagem
        if (!temAlgumaPermissao) {
            permissoesContainer.innerHTML = '<span class="text-muted fst-italic small">Nenhuma</span>';
        }

        tdPermissoes.appendChild(permissoesContainer); // Adiciona o container de permissões à célula

        // --- Célula de Ações (Botões Editar/Excluir) ---
        const tdAcoes = document.createElement('td'); // Cria a célula para os botões de ação
        tdAcoes.classList.add('text-center', 'table-actions'); // Adiciona classes para centralizar e estilizar

        // Botão Editar
        const btnEditar = document.createElement('button');
        btnEditar.classList.add('btn', 'btn-outline-primary', 'btn-sm', 'py-0', 'px-1'); // Classes de estilo
        btnEditar.innerHTML = '<i class="bi bi-pencil-square"></i>'; // Ícone de lápis
        btnEditar.title = "Editar Membro"; // Tooltip
        btnEditar.onclick = () => abrirModalEditarMembro(membro.id); // Ação ao clicar

        // Botão Excluir
        const btnExcluir = document.createElement('button');
        btnExcluir.classList.add('btn', 'btn-outline-danger', 'btn-sm', 'py-0', 'px-1'); // Classes de estilo
        btnExcluir.innerHTML = '<i class="bi bi-trash-fill"></i>'; // Ícone de lixeira
        btnExcluir.title = "Excluir Membro"; // Tooltip
        btnExcluir.onclick = () => excluirMembro(membro.id); // Ação ao clicar (agora async)

        tdAcoes.appendChild(btnEditar); // Adiciona o botão editar à célula
        tdAcoes.appendChild(btnExcluir); // Adiciona o botão excluir à célula

        // Adiciona as células criadas à linha da tabela
        tr.appendChild(tdNome);
        tr.appendChild(tdPermissoes);
        tr.appendChild(tdAcoes);

        tbody.appendChild(tr); // Adiciona a linha completa ao corpo da tabela
    });
    console.log('Tabela de membros renderizada.');
}


function renderizarPermissoesModal(permissoesAtuais = {}) {
    const container = document.getElementById('permissoesContainer');
    if (!container) {
        console.error("Elemento 'permissoesContainer' não encontrado no modal.");
        return;
    }
    container.innerHTML = ''; // Limpa o container

    // Agrupa as permissões por 'grupo' definido em config.js
    const grupos = PERMISSOES_BASE.reduce((acc, permissao) => {
        acc[permissao.grupo] = acc[permissao.grupo] || []; // Inicializa o array do grupo se não existir
        acc[permissao.grupo].push(permissao); // Adiciona a permissão ao grupo
        return acc;
    }, {});

    // Itera sobre os grupos de permissões ordenados pelo nome do grupo
    Object.keys(grupos).sort().forEach(grupoNome => {
        // Ordena as permissões dentro do grupo pela ordem definida em PERMISSOES_BASE
        const permissoesOrdenadas = grupos[grupoNome].sort((a, b) => {
            const indexA = PERMISSOES_BASE.findIndex(p => p.id === a.id);
            const indexB = PERMISSOES_BASE.findIndex(p => p.id === b.id);
            return indexA - indexB;
        });

        // Cria um checkbox para cada permissão no grupo
        permissoesOrdenadas.forEach(permissao => {
            const div = document.createElement('div');
            div.classList.add('form-check', 'form-switch', 'mb-2'); // Classes de estilo Bootstrap

            // Input (checkbox)
            const input = document.createElement('input');
            input.classList.add('form-check-input');
            input.type = 'checkbox';
            input.value = permissao.id; // O valor do checkbox é o ID da permissão
            input.id = `perm-${permissao.id}`; // ID único para o input
            // Marca o checkbox se a permissão existir em 'permissoesAtuais'
            input.checked = permissoesAtuais[permissao.id] || false;

            // Label (rótulo)
            const label = document.createElement('label');
            label.classList.add('form-check-label');
            label.htmlFor = `perm-${permissao.id}`; // Associa o label ao input
            label.textContent = permissao.nome; // Texto do label é o nome da permissão

            // Adiciona o input e o label à div
            div.appendChild(input);
            div.appendChild(label);
            // Adiciona a div ao container principal
            container.appendChild(div);
        });
    });
}


function toggleTodasPermissoes(marcar) {
    // Seleciona todos os checkboxes dentro do container de permissões
    const checkboxes = document.querySelectorAll('#permissoesContainer input[type="checkbox"]');
    // Marca ou desmarca todos os checkboxes baseado no parâmetro 'marcar'
    checkboxes.forEach(cb => cb.checked = marcar);
}


// --- Funções de Geração de Designações (sem mudanças significativas na lógica principal) ---

function gerarDesignacoesMensais() {
    // Impede execuções múltiplas simultâneas
    if (isGerando) {
        console.warn("Geração já está em andamento.");
        return;
    }
    isGerando = true; // Define a flag de geração em andamento

    // Atualiza a interface do botão para indicar carregamento
    const btnGerar = document.getElementById('btnGerarDesignacoes');
    const btnGerarOriginalText = btnGerar.innerHTML; // Salva o texto original do botão
    btnGerar.disabled = true; // Desabilita o botão
    btnGerar.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Gerando...`; // Mostra spinner

    // Usa setTimeout para permitir que a UI atualize antes do processamento pesado
    setTimeout(() => {
        try {
            // Obtém o mês e ano selecionados pelo usuário
            const mesSelecionado = parseInt(document.getElementById('mesSelect').value);
            const anoSelecionado = parseInt(document.getElementById('anoInput').value);

            // Validação básica de mês e ano
            if (isNaN(mesSelecionado) || isNaN(anoSelecionado) || anoSelecionado < 1900 || anoSelecionado > 2200) {
                alert("Por favor, selecione um mês e um ano válidos.");
                throw new Error("Mês ou ano inválido");
            }

            // Cria a chave de identificação do mês/ano (ex: "2024-05")
            const anoMes = `${anoSelecionado}-${String(mesSelecionado + 1).padStart(2, '0')}`;
            console.log(`Iniciando geração para ${anoMes}`);

            // Mostra um indicador de carregamento na área de resultados
            const resultadoContainer = document.getElementById('resultadoDesignacoes');
            resultadoContainer.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Carregando...</span></div><p class="mt-2">Calculando designações...</p></div>';

            // Chama a função principal de cálculo das designações
            // NOTA: 'membros' aqui é o array em memória, carregado do IndexedDB no início
            const { htmlTabelas, designacoesFeitas } = calcularDesignacoes(mesSelecionado, anoSelecionado);

            // Verifica se o resultado foi gerado com sucesso
            if (htmlTabelas && designacoesFeitas && Object.keys(designacoesFeitas).length > 0) {
                resultadoContainer.innerHTML = htmlTabelas; // Insere o HTML das tabelas no container

                // Adiciona listeners aos nomes clicáveis para permitir substituição
                adicionarListenersSubstituicao();

                // Salva o histórico das designações geradas (atualiza o array 'membros' em memória)
                salvarHistoricoDesignacoes(designacoesFeitas, anoSelecionado, mesSelecionado);

                // Atualiza o cache em memória para o mês gerado (usado para substituições)
                designacoesMensaisCache[anoMes] = { htmlTabelas, designacoesFeitas };

                console.log(`Designações para ${anoMes} geradas e salvas no histórico em memória.`);
                document.getElementById('botaoExportarContainer').style.display = 'block'; // Mostra o botão de exportar PDF

                // IMPORTANTE: Salva o estado atualizado dos membros (com o novo histórico) no IndexedDB
                salvarMembrosLocalmente().catch(err => {
                    console.error("Erro ao salvar histórico no IndexedDB após geração:", err);
                    alert("Atenção: As designações foram geradas, mas houve um erro ao salvar o histórico no banco de dados local.");
                });

            } else {
                // Caso a geração falhe ou não produza resultados
                resultadoContainer.innerHTML = '<div class="alert alert-warning text-center" role="alert">Não foi possível gerar todas as designações. Verifique o número de membros habilitados e tente novamente.</div>';
                console.warn(`Geração para ${anoMes} falhou ou incompleta.`);
                document.getElementById('botaoExportarContainer').style.display = 'none'; // Esconde o botão de exportar
            }
        } catch (error) {
            // Captura erros durante a geração
            console.error("Erro detalhado ao gerar designações:", error);
            document.getElementById('resultadoDesignacoes').innerHTML = `<div class="alert alert-danger text-center" role="alert">Ocorreu um erro inesperado durante a geração: ${error.message}. Verifique o console para mais detalhes.</div>`;
            document.getElementById('botaoExportarContainer').style.display = 'none'; // Esconde o botão em caso de erro
        } finally {
            // Restaura o botão ao estado original e reseta a flag de geração
            btnGerar.disabled = false;
            btnGerar.innerHTML = btnGerarOriginalText;
            isGerando = false;
            console.log("Processo de geração finalizado.");
        }
    }, 100); // Delay de 100ms
}

// =============================================================
// FUNÇÃO calcularDesignacoes (Lógica interna mantida, usa 'membros' em memória)
// =============================================================
function calcularDesignacoes(mes, ano) {
    console.log(`Calculando para ${NOMES_MESES[mes]}/${ano}`);
    const primeiroDiaMes = new Date(ano, mes, 1);
    const ultimoDiaMes = new Date(ano, mes + 1, 0);
    const designacoesFeitas = {}; // Acumula as designações feitas neste mês
    // Cria uma cópia profunda dos membros em memória para manipular durante o cálculo
    // Isso evita alterar o array 'membros' original diretamente nesta função
    const membrosDisponiveis = JSON.parse(JSON.stringify(membros));

    // 1. Obter todas as datas de reunião no mês (já ordenadas)
    const datasReunioes = [];
    for (let dia = 1; dia <= ultimoDiaMes.getDate(); dia++) {
        const dataAtual = new Date(ano, mes, dia);
        const diaSemana = dataAtual.getDay(); // 0=Dom, 1=Seg, ..., 4=Qui, ...
        // Verifica se o dia da semana corresponde aos dias de reunião definidos em config.js
        if (diaSemana === DIAS_REUNIAO.meioSemana || diaSemana === DIAS_REUNIAO.publica) {
            datasReunioes.push(dataAtual);
        }
    }
    console.log("Datas de reunião no mês:", datasReunioes.map(d => d.toLocaleDateString()));

    let dataAnteriorStr = null; // Guarda a string da data anterior processada (para critério de desempate)

    // 2. Iterar por cada data de reunião
    for (const data of datasReunioes) {
        const dataStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`; // FormatocameraContinuous-MM-DD
        designacoesFeitas[dataStr] = {}; // Inicializa objeto para armazenar designações deste dia
        const diaSemana = data.getDay();
        const tipoReuniaoAtual = (diaSemana === DIAS_REUNIAO.meioSemana) ? 'meioSemana' : 'publica';
        const anoMesImpedimento = `${ano}-${String(mes + 1).padStart(2, '0')}`; // Formato YYYY-MM para verificar impedimentos

        console.log(`\n--- Processando ${dataStr} (${tipoReuniaoAtual}) ---`);

        // 3. Iterar por cada função necessária para o tipo de reunião atual
        const funcoesNecessarias = FUNCOES_DESIGNADAS.filter(f => f.tipoReuniao.includes(tipoReuniaoAtual));

        for (const funcao of funcoesNecessarias) {
            console.log(`Tentando designar para: ${funcao.nome} (ID: ${funcao.id})`);

            // 4. Encontrar membros elegíveis para esta função neste dia
            let membrosElegiveis = membrosDisponiveis.filter(m => {
                // Verifica se o membro tem a permissão base necessária para a função e tipo de reunião
                let temPermissaoBase = false;
                const permissoesMembro = m.permissoesBase || {};
                // Lógica específica para cada grupo de funções (Indicadores, Volantes, Leitor/Presidente)
                if (funcao.tabela === 'Indicadores') {
                    temPermissaoBase = (tipoReuniaoAtual === 'meioSemana' && permissoesMembro.indicadorQui) ||
                        (tipoReuniaoAtual === 'publica' && permissoesMembro.indicadorDom);
                } else if (funcao.tabela === 'Volantes') {
                    temPermissaoBase = (tipoReuniaoAtual === 'meioSemana' && permissoesMembro.volanteQui) ||
                        (tipoReuniaoAtual === 'publica' && permissoesMembro.volanteDom);
                } else if (funcao.tabela === 'LeitorPresidente') {
                    if (funcao.id === 'leitorSentinela' && tipoReuniaoAtual === 'publica' && permissoesMembro.leitor) temPermissaoBase = true;
                    if (funcao.id === 'presidenteReuniao' && tipoReuniaoAtual === 'publica' && permissoesMembro.presidente) temPermissaoBase = true;
                }

                // Verifica se o membro está impedido neste mês
                const estaImpedido = m.impedimentos?.includes(anoMesImpedimento);
                // Verifica se o membro já foi designado para OUTRA função NESTE MESMO DIA
                const jaDesignadoHoje = Object.values(designacoesFeitas[dataStr]).includes(m.id);

                // Retorna true se tiver permissão, não estiver impedido e não tiver sido designado hoje
                return temPermissaoBase && !estaImpedido && !jaDesignadoHoje;
            });

            console.log(`Membros elegíveis inicialmente (${funcao.nome}): ${membrosElegiveis.map(m => m.nome).join(', ')}`);

            // Se não houver elegíveis, registra e pula para a próxima função
            if (membrosElegiveis.length === 0) {
                console.error(`ALERTA: Nenhum membro elegível encontrado para ${funcao.nome} em ${dataStr}!`);
                designacoesFeitas[dataStr][funcao.id] = null; // Marca como não designado
                continue; // Próxima função
            }

            // 5. Critérios de Desempate (ordena os elegíveis)
            membrosElegiveis.sort((a, b) => {
                // Critério 0: Penalizar quem fez a MESMA função na reunião ANTERIOR do mesmo tipo
                // (Considera apenas a data anterior processada no loop)
                let fezReuniaoAnteriorA = false;
                let fezReuniaoAnteriorB = false;
                if (dataAnteriorStr && designacoesFeitas[dataAnteriorStr]) {
                    // Verifica se o membro A ou B fez esta função na data anterior
                    fezReuniaoAnteriorA = designacoesFeitas[dataAnteriorStr][funcao.id] === a.id;
                    fezReuniaoAnteriorB = designacoesFeitas[dataAnteriorStr][funcao.id] === b.id;
                }
                // Se A fez e B não, B tem prioridade (retorna -1). Se B fez e A não, A tem prioridade (retorna 1).
                if (fezReuniaoAnteriorA && !fezReuniaoAnteriorB) return 1; // Penaliza A
                if (!fezReuniaoAnteriorA && fezReuniaoAnteriorB) return -1; // Penaliza B

                // Critério 1: Menos vezes para ESTA FUNÇÃO no MÊS ATUAL (contagem parcial)
                const designacoesFuncaoMesA = contarDesignacoesFuncaoMesAtual(a.id, funcao.id, designacoesFeitas);
                const designacoesFuncaoMesB = contarDesignacoesFuncaoMesAtual(b.id, funcao.id, designacoesFeitas);
                if (designacoesFuncaoMesA !== designacoesFuncaoMesB) {
                    return designacoesFuncaoMesA - designacoesFuncaoMesB; // Menos vezes primeiro
                }

                // Critério 2: Menos vezes TOTAIS (qualquer função) NO MÊS ATUAL (contagem parcial)
                const designacoesMesA = contarDesignacoesMesAtual(a.id, designacoesFeitas);
                const designacoesMesB = contarDesignacoesMesAtual(b.id, designacoesFeitas);
                if (designacoesMesA !== designacoesMesB) {
                    return designacoesMesA - designacoesMesB; // Menos vezes primeiro
                }

                // Critério 3: Menos vezes no HISTÓRICO PASSADO (antes do mês atual) para ESTA FUNÇÃO
                // Usa a função contarDesignacoes que lê o histórico do membro (do array 'membrosDisponiveis')
                const historicoPassadoA = contarDesignacoes(a, funcao.id, ano, mes);
                const historicoPassadoB = contarDesignacoes(b, funcao.id, ano, mes);
                if (historicoPassadoA.total !== historicoPassadoB.total) {
                    return historicoPassadoA.total - historicoPassadoB.total; // Menos vezes no passado primeiro
                }

                // Critério 4: Última vez mais antiga no HISTÓRICO PASSADO para ESTA FUNÇÃO
                const ultimaA = historicoPassadoA.ultimaData ? new Date(historicoPassadoA.ultimaData).getTime() : 0;
                const ultimaB = historicoPassadoB.ultimaData ? new Date(historicoPassadoB.ultimaData).getTime() : 0;
                if (ultimaA !== ultimaB) {
                    return ultimaA - ultimaB; // Data mais antiga (menor timestamp) primeiro
                }

                // Critério 5: Sorteio aleatório como último recurso
                return Math.random() - 0.5;
            });

            // 6. Designar o membro selecionado (o primeiro da lista ordenada)
            const membroDesignado = membrosElegiveis[0];
            designacoesFeitas[dataStr][funcao.id] = membroDesignado.id; // Armazena o ID do membro designado
            console.log(`Escolhido para ${funcao.nome}: ${membroDesignado.nome} (Histórico Total: ${contarDesignacoes(membroDesignado, funcao.id, ano, mes).total}, Designações Totais Mês: ${contarDesignacoesMesAtual(membroDesignado.id, designacoesFeitas)}, Designações Função Mês: ${contarDesignacoesFuncaoMesAtual(membroDesignado.id, funcao.id, designacoesFeitas)})`);
        } // Fim do loop de funções

        // Atualiza a data anterior para a próxima iteração do loop de datas
        dataAnteriorStr = dataStr;
    } // Fim do loop de datas

    // 7. Gerar HTML das Tabelas
    let htmlTabelas = `<h3 class="text-center mb-4">Designações para ${NOMES_MESES[mes]} de ${ano}</h3>`;
    htmlTabelas += '<div class="row g-4">'; // Abre a row do Bootstrap para layout em colunas

    // Função auxiliar para criar a célula HTML da data com dia e badge
    const criarCelulaDataHtml = (data) => {
        const diaNumero = data.getDate();
        const diaSemanaNum = data.getDay();
        const diaSemanaStr = NOMES_DIAS_SEMANA[diaSemanaNum];
        let badgeClass = '';
        let badgeHtml = '';
        // Define a classe do badge com base no dia da semana
        if (diaSemanaNum === DIAS_REUNIAO.meioSemana) badgeClass = 'badge-quinta';
        else if (diaSemanaNum === DIAS_REUNIAO.publica) badgeClass = 'badge-domingo';
        // Cria o HTML do badge se houver classe definida
        if (badgeClass) badgeHtml = `<span class="badge ${badgeClass} ms-1">${diaSemanaStr}</span>`;
        // Retorna o HTML da célula
        return `<td class="data-cell"><span class="dia-numero">${diaNumero}</span>${badgeHtml}</td>`;
    };

    // --- Tabela de Indicadores ---
    htmlTabelas += '<div class="col-lg-4 col-md-6 mb-4">'; // Coluna Bootstrap
    htmlTabelas += '<h4 class="text-center mb-3 table-title" data-table-id="indicadores"><i class="bi bi-people me-2"></i>Indicadores</h4>';
    htmlTabelas += '<table class="table table-bordered table-striped table-sm table-designacoes align-middle" id="tabela-indicadores">';
    htmlTabelas += '<thead class="table-light"><tr><th>Data</th><th>Externo</th><th>Palco</th></tr></thead><tbody>';
    // Itera sobre as datas de reunião para preencher as linhas da tabela
    datasReunioes.forEach(data => {
        const dataStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
        // Obtém o HTML do link do membro (ou '--') para cada função
        const nomeExternoHtml = criarLinkMembroDesignado(designacoesFeitas[dataStr]?.['indicadorExterno'], dataStr, 'indicadorExterno');
        const nomePalcoHtml = criarLinkMembroDesignado(designacoesFeitas[dataStr]?.['indicadorPalco'], dataStr, 'indicadorPalco');
        // Cria a linha da tabela
        htmlTabelas += `<tr>${criarCelulaDataHtml(data)}<td>${nomeExternoHtml}</td><td>${nomePalcoHtml}</td></tr>`;
    });
    htmlTabelas += '</tbody></table></div>'; // Fecha a tabela e a coluna

    // --- Tabela de Volantes ---
    htmlTabelas += '<div class="col-lg-4 col-md-6 mb-4">';
    htmlTabelas += '<h4 class="text-center mb-3 table-title" data-table-id="volantes"><i class="bi bi-mic me-2"></i>Volantes</h4>';
    htmlTabelas += '<table class="table table-bordered table-striped table-sm table-designacoes align-middle" id="tabela-volantes">';
    htmlTabelas += '<thead class="table-light"><tr><th>Data</th><th>Volante 1</th><th>Volante 2</th></tr></thead><tbody>';
    datasReunioes.forEach(data => {
        const dataStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
        const nomeVol1Html = criarLinkMembroDesignado(designacoesFeitas[dataStr]?.['volante1'], dataStr, 'volante1');
        const nomeVol2Html = criarLinkMembroDesignado(designacoesFeitas[dataStr]?.['volante2'], dataStr, 'volante2');
        htmlTabelas += `<tr>${criarCelulaDataHtml(data)}<td>${nomeVol1Html}</td><td>${nomeVol2Html}</td></tr>`;
    });
    htmlTabelas += '</tbody></table></div>';

    // --- Tabela de Leitor/Presidente ---
    htmlTabelas += '<div class="col-lg-4 col-md-12 mb-4">'; // Ocupa largura total em telas menores (md)
    htmlTabelas += '<h4 class="text-center mb-3 table-title" data-table-id="leitor-presidente"><i class="bi bi-person-lines-fill me-2"></i>Leitor/Presidente</h4>';
    htmlTabelas += '<table class="table table-bordered table-striped table-sm table-designacoes align-middle" id="tabela-outros">';
    htmlTabelas += '<thead class="table-light"><tr><th>Data</th><th>Leitor</th><th>Presidente</th></tr></thead><tbody>';
    datasReunioes.forEach(data => {
        const dataStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
        // Apenas reuniões públicas têm Leitor/Presidente
        const diaSemana = data.getDay();
        let nomeLeitorHtml = '<span class="text-muted">--</span>';
        let nomePresidenteHtml = '<span class="text-muted">--</span>';
        if (diaSemana === DIAS_REUNIAO.publica) {
            nomeLeitorHtml = criarLinkMembroDesignado(designacoesFeitas[dataStr]?.['leitorSentinela'], dataStr, 'leitorSentinela');
            nomePresidenteHtml = criarLinkMembroDesignado(designacoesFeitas[dataStr]?.['presidenteReuniao'], dataStr, 'presidenteReuniao');
        }
        htmlTabelas += `<tr>${criarCelulaDataHtml(data)}<td>${nomeLeitorHtml}</td><td>${nomePresidenteHtml}</td></tr>`;
    });
    htmlTabelas += '</tbody></table></div>';

    htmlTabelas += '</div>'; // Fecha a row

    // Retorna o HTML gerado e o objeto com as designações feitas
    return { htmlTabelas, designacoesFeitas };
}
// =============================================================
// FIM DA FUNÇÃO calcularDesignacoes
// =============================================================


// --- Funções Auxiliares de Cálculo e Histórico (Lógica interna mantida) ---

/**
 * Conta quantas vezes um membro foi designado para uma função específica ANTES do mês/ano atuais.
 * Lê o histórico armazenado no objeto do membro.
 * @param {object} membro Objeto do membro (com historicoDesignacoes).
 * @param {string} funcaoId ID da função a ser contada.
 * @param {number} anoAtual Ano atual (para filtrar histórico passado).
 * @param {number} mesAtual Mês atual (0-11) (para filtrar histórico passado).
 * @returns {{total: number, ultimaData: string|null}} Objeto com o total e a data da última designação.
 */
function contarDesignacoes(membro, funcaoId, anoAtual, mesAtual) {
    let total = 0;
    let ultimaData = null; // Armazena a data mais recente (formato YYYY-MM-DD)

    // Verifica se o membro possui histórico
    if (membro.historicoDesignacoes) {
        // Ordena os meses do histórico (chaves YYYY-MM)
        const mesesHistoricoOrdenados = Object.keys(membro.historicoDesignacoes).sort();

        // Itera sobre cada mês no histórico ordenado
        for (const anoMesHist of mesesHistoricoOrdenados) {
            const [anoHist, mesHist] = anoMesHist.split('-').map(Number); // Extrai ano e mês do histórico
            const dataInicioMesHist = new Date(anoHist, mesHist - 1, 1); // Cria data do início do mês do histórico
            const dataInicioMesAtual = new Date(anoAtual, mesAtual, 1); // Cria data do início do mês atual

            // Compara se o mês do histórico é anterior ao mês atual
            if (dataInicioMesHist < dataInicioMesAtual) {
                const dadosMes = membro.historicoDesignacoes[anoMesHist]; // Acessa os dados do mês
                // Verifica se existem designações registradas para este mês
                if (dadosMes && dadosMes.designacoes) {
                    // Itera sobre as datas (YYYY-MM-DD) dentro do mês do histórico
                    Object.entries(dadosMes.designacoes).forEach(([dataCompleta, funcoesDoDia]) => {
                        // Verifica se as funções do dia são um objeto válido
                        if (typeof funcoesDoDia === 'object' && funcoesDoDia !== null) {
                            // Verifica se o membro foi designado para a função específica neste dia
                            if (funcoesDoDia[funcaoId] === membro.id) {
                                total++; // Incrementa o contador total
                                // Atualiza a 'ultimaData' se esta data for mais recente
                                if (!ultimaData || new Date(dataCompleta) > new Date(ultimaData)) {
                                    ultimaData = dataCompleta;
                                }
                            }
                        }
                    });
                }
            }
        }
    }
    // Retorna o total de designações passadas e a data da última
    return { total, ultimaData };
}


/**
 * Conta quantas vezes um membro foi designado para QUALQUER função durante a geração do MÊS ATUAL.
 * Usa o objeto parcial 'designacoesParciaisMes' que está sendo construído.
 * @param {string} membroId ID do membro.
 * @param {object} designacoesParciaisMes Objeto com as designações já feitas no mês atual.
 * @returns {number} Total de designações do membro no mês atual.
 */
function contarDesignacoesMesAtual(membroId, designacoesParciaisMes) {
    let count = 0;
    // Itera sobre os dias já processados no mês atual
    Object.values(designacoesParciaisMes).forEach(funcoesDoDia => {
        // Verifica se o ID do membro aparece em alguma das funções designadas para o dia
        if (Object.values(funcoesDoDia).includes(membroId)) {
            count++; // Incrementa se o membro foi designado neste dia
        }
    });
    return count;
}

/**
 * Conta quantas vezes um membro foi designado para uma FUNÇÃO ESPECÍFICA durante a geração do MÊS ATUAL.
 * Usa o objeto parcial 'designacoesParciaisMes'.
 * @param {string} membroId ID do membro.
 * @param {string} funcaoId ID da função específica.
 * @param {object} designacoesParciaisMes Objeto com as designações já feitas no mês atual.
 * @returns {number} Total de vezes que o membro foi designado para a função específica no mês atual.
 */
function contarDesignacoesFuncaoMesAtual(membroId, funcaoId, designacoesParciaisMes) {
    let count = 0;
    // Itera sobre os dias já processados no mês atual
    Object.values(designacoesParciaisMes).forEach(funcoesDoDia => {
        // Verifica se o membro foi designado para a função específica neste dia
        if (funcoesDoDia[funcaoId] === membroId) {
            count++; // Incrementa se foi designado para a função específica
        }
    });
    return count;
}


/**
 * Obtém o nome de um membro a partir do seu ID.
 * Usado principalmente para a exportação PDF.
 * @param {string | null} idMembro ID do membro.
 * @returns {string} Nome do membro ou texto indicativo se não encontrado/nulo.
 */
function obterNomeMembro(idMembro) {
    if (!idMembro) return '--'; // Retorna '--' se o ID for nulo ou indefinido
    // Procura o membro no array em memória
    const membro = membros.find(m => m.id === idMembro);
    // Retorna o nome se encontrado, ou uma mensagem de erro caso contrário
    return membro ? membro.nome : `Membro não encontrado! (ID: ${idMembro})`;
}

/**
 * Cria o HTML de um link clicável para um membro designado na tabela de resultados.
 * O link contém data attributes para facilitar a substituição.
 * @param {string | null} idMembro ID do membro designado.
 * @param {string} dataStr Data da designação (YYYY-MM-DD).
 * @param {string} funcaoId ID da função designada.
 * @returns {string} String HTML do link ou span.
 */
function criarLinkMembroDesignado(idMembro, dataStr, funcaoId) {
    // Se não houver membro designado, retorna um span simples
    if (!idMembro) return '<span class="text-muted">--</span>';

    // Procura o membro no array em memória
    const membro = membros.find(m => m.id === idMembro);
    // Se o membro não for encontrado (pode acontecer se dados forem corrompidos), mostra erro
    if (!membro) {
        return `<span class="text-danger" title="ID: ${idMembro}">Membro não encontrado!</span>`;
    }

    // Cria um elemento <a> (link)
    const link = document.createElement('a');
    link.href = '#'; // Link vazio, a ação será via JS
    link.textContent = membro.nome; // Texto do link é o nome do membro
    link.classList.add('nome-substituivel', 'text-decoration-none'); // Classes para identificação e estilo

    // Adiciona data attributes para armazenar informações necessárias para a substituição
    link.dataset.date = dataStr; // Data da designação
    link.dataset.functionId = funcaoId; // ID da função
    link.dataset.originalMemberId = idMembro; // ID do membro atualmente designado

    // Retorna a representação HTML do link criado
    return link.outerHTML;
}

/**
 * Salva as designações geradas ('designacoesFeitas') no histórico de cada membro envolvido.
 * ATENÇÃO: Esta função modifica diretamente o array 'membros' em memória.
 * É crucial chamar 'salvarMembrosLocalmente()' depois para persistir essas mudanças no IndexedDB.
 * @param {object} designacoesFeitas Objeto com as designações do mês (formato: { 'YYYY-MM-DD': { funcaoId: membroId, ... }, ... }).
 * @param {number} ano Ano das designações.
 * @param {number} mes Mês das designações (0-11).
 */
function salvarHistoricoDesignacoes(designacoesFeitas, ano, mes) {
    // Cria a chave do mês/ano (ex: "2024-05")
    const anoMes = `${ano}-${String(mes + 1).padStart(2, '0')}`;

    // Itera sobre cada data (YYYY-MM-DD) nas designações feitas
    Object.entries(designacoesFeitas).forEach(([dataStr, funcoesDoDia]) => {
        // Itera sobre cada função (funcaoId) e membro (membroId) designado nesse dia
        Object.entries(funcoesDoDia).forEach(([funcaoId, membroId]) => {
            // Processa apenas se um membro foi efetivamente designado (membroId não é nulo)
            if (membroId) {
                // Encontra o objeto do membro correspondente no array 'membros' em memória
                const membro = membros.find(m => m.id === membroId);
                if (membro) {
                    // Inicializa o histórico do membro se ainda não existir
                    if (!membro.historicoDesignacoes) membro.historicoDesignacoes = {};
                    // Inicializa o objeto para o mês/ano específico se não existir
                    if (!membro.historicoDesignacoes[anoMes]) membro.historicoDesignacoes[anoMes] = { designacoes: {} };
                    // Inicializa o objeto para a data específica se não existir
                    if (!membro.historicoDesignacoes[anoMes].designacoes[dataStr]) {
                        membro.historicoDesignacoes[anoMes].designacoes[dataStr] = {};
                    }
                    // Armazena a designação: no histórico do membro, para aquele mês/ano, naquela data,
                    // registra que ele fez aquela função (associando funcaoId ao membroId)
                    membro.historicoDesignacoes[anoMes].designacoes[dataStr][funcaoId] = membroId;
                } else {
                    // Loga um aviso se o membro não for encontrado (situação inesperada)
                    console.warn(`Membro com ID ${membroId} não encontrado ao tentar salvar histórico para ${dataStr}, função ${funcaoId}.`);
                }
            }
        });
    });

    // NÃO CHAMA salvarMembrosLocalmente() AQUI.
    // A função que chama salvarHistoricoDesignacoes (gerarDesignacoesMensais) é responsável por salvar no final.
    console.log(`Histórico para ${anoMes} atualizado no array 'membros' em memória.`);
}


function limparResultadoMensal() {
    const resultadoContainer = document.getElementById('resultadoDesignacoes');
    const mesSelecionadoElement = document.getElementById('mesSelect');
    const anoSelecionadoElement = document.getElementById('anoInput');

    let nomeMes = 'Mês inválido';
    let anoSelecionado = 'Ano inválido';

    // Tenta obter o nome do mês selecionado
    if (mesSelecionadoElement && mesSelecionadoElement.value !== '') {
        const mesIndex = parseInt(mesSelecionadoElement.value);
        if (!isNaN(mesIndex) && mesIndex >= 0 && mesIndex < NOMES_MESES.length) {
            nomeMes = NOMES_MESES[mesIndex];
        }
    }
    // Tenta obter o ano selecionado
    if (anoSelecionadoElement && anoSelecionadoElement.value !== '') {
        anoSelecionado = anoSelecionadoElement.value;
    }

    // Define o HTML padrão para a área de resultados quando está limpa
    resultadoContainer.innerHTML = `
        <div class="text-center text-muted p-4 border rounded bg-light">
            <i class="bi bi-info-circle fs-4 mb-2"></i><br>
            Selecione o mês e ano e clique em "Gerar" para ver as designações.<br>
            Pronto para gerar para <strong>${nomeMes} de ${anoSelecionado}</strong>.
        </div>`;
    // Esconde o botão de exportar PDF
    document.getElementById('botaoExportarContainer').style.display = 'none';
}

// --- Funções de Limpeza de Dados ---

function abrirConfirmacaoLimparDados() {
    // Fecha o modal de membro se estiver aberto antes de abrir o modal de confirmação
    if (membroModal && membroModal._isShown) {
        membroModal.hide();
        const modalElement = document.getElementById('membroModal');
        // Adiciona um listener para abrir o modal de confirmação APÓS o modal de membro fechar
        modalElement.addEventListener('hidden.bs.modal', () => {
            if (confirmacaoLimparModal) confirmacaoLimparModal.show();
        }, { once: true }); // 'once: true' garante que o listener execute apenas uma vez
    } else {
        // Se o modal de membro não estiver aberto, abre o de confirmação diretamente
        if (confirmacaoLimparModal) confirmacaoLimparModal.show();
    }
}


async function limparTodoHistorico() { // Função agora é async
    // Pede confirmação dupla ao usuário
    if (confirm("Tem certeza que deseja LIMPAR TODO O HISTÓRICO de designações de TODOS os membros?\n\nOS MEMBROS E SUAS PERMISSÕES SERÃO MANTIDOS.\n\nEsta ação não pode ser desfeita.")) {
        console.warn("Limpando todo o histórico de designações...");
        // Itera sobre todos os membros no array em memória
        membros.forEach(membro => {
            membro.historicoDesignacoes = {}; // Reseta o histórico de cada membro
        });

        try {
            await salvarMembrosLocalmente(); // Salva a lista de membros (sem histórico) no IndexedDB
            renderizarTabelaMembros(); // Atualiza a tabela (não deve mudar visualmente)
            limparResultadoMensal(); // Limpa a área de resultados das designações
            if (confirmacaoLimparModal) confirmacaoLimparModal.hide(); // Fecha o modal de confirmação
            alert("Histórico de todas as designações foi removido com sucesso.");
        } catch (error) {
            console.error("Falha ao limpar histórico no IndexedDB:", error);
            alert("Ocorreu um erro ao tentar limpar o histórico no banco de dados local.");
            // Recarrega do DB para garantir consistência
            await carregarMembrosLocalmente();
            renderizarTabelaMembros();
        }
    }
}

async function limparTodosDados() { // Função agora é async
    // Pede confirmação tripla e enfática ao usuário devido à gravidade da ação
    if (confirm("!!! ATENÇÃO !!!\n\nTem certeza que deseja APAGAR TODOS OS DADOS?\n\nIsso inclui TODOS os membros, suas permissões, impedimentos e TODO o histórico.\nA aplicação voltará ao estado inicial.\n\nESTA AÇÃO É IRREVERSÍVEL.")) {
        if (confirm("SEGUNDA CONFIRMAÇÃO:\n\nRealmente deseja apagar TUDO? Não será possível recuperar os dados.")) {
            console.warn("LIMPANDO TODOS OS DADOS DA APLICAÇÃO...");
            membros = []; // Limpa o array de membros em memória

            try {
                // Tenta limpar o object store no IndexedDB
                if (!db) {
                    console.warn("Banco de dados não estava aberto ao tentar limpar tudo. Tentando abrir...");
                    await abrirBancoDeDados();
                }
                if (db) {
                    await new Promise((resolve, reject) => {
                        const transaction = db.transaction([STORE_NAME], 'readwrite');
                        const store = transaction.objectStore(STORE_NAME);
                        const clearRequest = store.clear();
                        clearRequest.onsuccess = resolve;
                        clearRequest.onerror = (event) => reject(new Error(`Erro ao limpar store: ${event.target.error}`));
                        transaction.onerror = (event) => reject(new Error(`Erro na transação de limpeza: ${event.target.error}`));
                    });
                    console.log("IndexedDB store limpo com sucesso.");
                } else {
                    throw new Error("Não foi possível acessar o banco de dados para limpeza completa.");
                }

                renderizarTabelaMembros(); // Atualiza a tabela (mostrará vazia)
                limparResultadoMensal(); // Limpa a área de resultados
                if (confirmacaoLimparModal) confirmacaoLimparModal.hide(); // Fecha o modal de confirmação
                alert("Todos os dados foram removidos com sucesso. A aplicação foi reiniciada.");

            } catch (error) {
                console.error("Erro ao limpar todos os dados (IndexedDB):", error);
                alert("Ocorreu um erro ao tentar apagar todos os dados do banco de dados local. Recarregue a página. Os dados em memória foram limpos.");
                // A interface já foi atualizada para refletir o array vazio,
                // mas o DB pode não ter sido limpo completamente.
            }
        }
    }
}


// --- Funções de Impedimento (sem mudanças na lógica) ---

function adicionarImpedimento() {
    const mesSelect = document.getElementById('impedimentoMes');
    const anoInput = document.getElementById('impedimentoAno');
    const mes = mesSelect.value; // Valor é '01', '02', ...
    const ano = anoInput.value;

    // Validação básica da entrada
    if (!mes || !ano || ano.length !== 4 || isNaN(parseInt(ano))) {
        alert("Por favor, selecione um mês e insira um ano válido (4 dígitos).");
        return;
    }

    // Formato do impedimento: YYYY-MM
    const impedimento = `${ano}-${mes}`;
    const listaImpedimentos = document.getElementById('listaImpedimentos');

    // Verifica se este impedimento já foi adicionado na lista do modal
    const jaExiste = Array.from(listaImpedimentos.children).some(item => item.dataset.impedimento === impedimento);

    if (jaExiste) {
        alert("Este impedimento já foi adicionado.");
        return;
    }

    // Obtém o nome do mês para exibição
    const nomeMes = NOMES_MESES[parseInt(mes) - 1]; // Converte '01' para índice 0, etc.

    // Cria o elemento <li> para exibir o impedimento
    const item = document.createElement('li');
    item.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center', 'py-1');
    item.textContent = `${nomeMes} de ${ano}`; // Texto visível
    item.dataset.impedimento = impedimento; // Armazena o valor YYYY-MM no dataset

    // Cria o botão de remover
    const btnRemover = document.createElement('button');
    btnRemover.type = 'button';
    btnRemover.classList.add('btn', 'btn-outline-danger', 'btn-sm', 'py-0', 'px-1');
    btnRemover.innerHTML = '<i class="bi bi-x-lg"></i>'; // Ícone de 'X'
    btnRemover.title = 'Remover Impedimento';
    btnRemover.onclick = () => item.remove(); // Remove o item da lista ao clicar

    item.appendChild(btnRemover); // Adiciona o botão ao item da lista

    // Insere o novo item na lista de forma ordenada (YYYY-MM)
    let inserido = false;
    for (const filho of listaImpedimentos.children) {
        // Compara o novo impedimento com os existentes
        if (impedimento < filho.dataset.impedimento) {
            listaImpedimentos.insertBefore(item, filho); // Insere antes do item maior
            inserido = true;
            break;
        }
    }
    // Se não foi inserido (é o maior ou a lista estava vazia), adiciona no final
    if (!inserido) {
        listaImpedimentos.appendChild(item);
    }
}

function renderizarListaImpedimentos(impedimentosArray = []) {
    const listaImpedimentos = document.getElementById('listaImpedimentos');
    if (!listaImpedimentos) return; // Sai se o elemento não existir
    listaImpedimentos.innerHTML = ''; // Limpa a lista atual

    // Ordena os impedimentos (formato YYYY-MM)
    impedimentosArray.sort();

    // Itera sobre os impedimentos ordenados para criar os itens da lista
    impedimentosArray.forEach(impedimento => {
        // Valida o formato YYYY-MM
        if (typeof impedimento === 'string' && impedimento.match(/^\d{4}-\d{2}$/)) {
            const [ano, mes] = impedimento.split('-');
            const nomeMes = NOMES_MESES[parseInt(mes) - 1]; // Obtém nome do mês

            // Verifica se o mês e ano são válidos
            if (nomeMes && ano.length === 4 && !isNaN(parseInt(ano))) {
                // Cria o elemento <li> (similar à função adicionarImpedimento)
                const item = document.createElement('li');
                item.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center', 'py-1');
                item.textContent = `${nomeMes} de ${ano}`;
                item.dataset.impedimento = impedimento;

                const btnRemover = document.createElement('button');
                btnRemover.type = 'button';
                btnRemover.classList.add('btn', 'btn-outline-danger', 'btn-sm', 'py-0', 'px-1');
                btnRemover.innerHTML = '<i class="bi bi-x-lg"></i>';
                btnRemover.title = 'Remover Impedimento';
                btnRemover.onclick = () => item.remove(); // Permite remover da lista do modal

                item.appendChild(btnRemover);
                listaImpedimentos.appendChild(item); // Adiciona à lista na interface
            } else {
                console.warn("Impedimento com formato inválido encontrado e ignorado:", impedimento);
            }
        } else {
            console.warn("Impedimento com tipo ou formato inválido encontrado e ignorado:", impedimento);
        }
    });
}


// --- Funções para Substituição Automática (lógica interna mantida, usa cache e 'membros' em memória) ---

function adicionarListenersSubstituicao() {
    const containerResultados = document.getElementById('resultadoDesignacoes');
    if (!containerResultados) return; // Sai se a área de resultados não existir

    // Seleciona todos os links com a classe 'nome-substituivel' dentro da área de resultados
    const linksSubstituiveis = containerResultados.querySelectorAll('a.nome-substituivel');
    console.log(`Adicionando listeners a ${linksSubstituiveis.length} nomes.`);

    // Adiciona um event listener de clique a cada link encontrado
    linksSubstituiveis.forEach(link => {
        link.addEventListener('click', function (event) {
            event.preventDefault(); // Previne a ação padrão do link (#)
            // Extrai os dados armazenados nos data attributes do link clicado
            const dataStr = this.dataset.date;
            const funcaoId = this.dataset.functionId;
            const membroOriginalId = this.dataset.originalMemberId;
            console.log(`Clique detectado para substituição: Data=${dataStr}, Função=${funcaoId}, Original=${membroOriginalId}`);
            // Chama a função para iniciar o processo de substituição
            iniciarSubstituicaoAutomatica(dataStr, funcaoId, membroOriginalId, this); // Passa o próprio elemento clicado (this)
        });
    });
}

function iniciarSubstituicaoAutomatica(dataStr, funcaoId, membroOriginalId, targetElement) {
    console.log(`Solicitação de substituição para: Data=${dataStr}, Função=${funcaoId}, Original=${membroOriginalId}`);

    // Encontra o objeto do membro original e da função nos dados em memória/configuração
    const membroOriginal = membros.find(m => m.id === membroOriginalId);
    const funcao = FUNCOES_DESIGNADAS.find(f => f.id === funcaoId);

    // Verifica se ambos foram encontrados
    if (!membroOriginal || !funcao) {
        console.error("Não foi possível encontrar o membro original ou a função para substituição.");
        alert("Erro ao iniciar substituição: membro original ou função não encontrados.");
        return;
    }

    // Tenta encontrar o melhor substituto elegível
    const substituto = encontrarMelhorSubstituto(dataStr, funcao, membroOriginalId);

    // Se um substituto for encontrado
    if (substituto) {
        // Formata a data para exibição na confirmação
        const dataFormatada = new Date(dataStr + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        // Pede confirmação ao usuário
        if (confirm(`Deseja substituir ${membroOriginal.nome} por ${substituto.nome} para a função "${funcao.nome}" em ${dataFormatada}?`)) {
            // Se confirmado, realiza a substituição
            realizarSubstituicao(dataStr, funcao, membroOriginalId, substituto.id, targetElement);
        }
    } else {
        // Se nenhum substituto for encontrado
        alert(`Não foi encontrado nenhum substituto elegível para ${membroOriginal.nome} na função "${funcao.nome}" em ${dataStr}.`);
    }
}

function encontrarMelhorSubstituto(dataStr, funcao, membroExcluidoId) {
    const [ano, mesNum] = dataStr.split('-').map(Number);
    const mes = mesNum - 1; // Mês no formato 0-11
    const anoMes = `${ano}-${String(mes + 1).padStart(2, '0')}`; // YYYY-MM
    const dataReuniao = new Date(dataStr + 'T00:00:00'); // Objeto Date da reunião
    const tipoReuniaoAtual = (dataReuniao.getDay() === DIAS_REUNIAO.meioSemana) ? 'meioSemana' : 'publica';

    // Acessa as designações JÁ FEITAS para este mês a partir do CACHE em memória
    const designacoesAtuaisMes = designacoesMensaisCache[anoMes]?.designacoesFeitas;
    if (!designacoesAtuaisMes) {
        console.error("Cache de designações não encontrado para o mês atual. Não é possível encontrar substituto.");
        // Idealmente, a geração deveria ter ocorrido antes, mas como fallback, poderia tentar recalcular aqui.
        // Por simplicidade, retornamos null.
        return null;
    }

    // Encontra a data da reunião anterior (se houver) para usar no critério de desempate
    let dataAnteriorStr = null;
    const datasMesOrdenadas = Object.keys(designacoesAtuaisMes).sort(); // Pega as datas do cache e ordena
    const indiceAtual = datasMesOrdenadas.indexOf(dataStr);
    if (indiceAtual > 0) {
        dataAnteriorStr = datasMesOrdenadas[indiceAtual - 1]; // Pega a data anterior
    }

    // Filtra os membros para encontrar os elegíveis para substituição
    let membrosElegiveis = membros.filter(m => {
        // 1. Exclui o próprio membro que está sendo substituído
        if (m.id === membroExcluidoId) return false;

        // 2. Verifica a permissão base (mesma lógica da função calcularDesignacoes)
        let temPermissaoBase = false;
        const permissoesMembro = m.permissoesBase || {};
        if (funcao.tabela === 'Indicadores') {
            temPermissaoBase = (tipoReuniaoAtual === 'meioSemana' && permissoesMembro.indicadorQui) ||
                (tipoReuniaoAtual === 'publica' && permissoesMembro.indicadorDom);
        } else if (funcao.tabela === 'Volantes') {
            temPermissaoBase = (tipoReuniaoAtual === 'meioSemana' && permissoesMembro.volanteQui) ||
                (tipoReuniaoAtual === 'publica' && permissoesMembro.volanteDom);
        } else if (funcao.tabela === 'LeitorPresidente') {
            if (funcao.id === 'leitorSentinela' && tipoReuniaoAtual === 'publica' && permissoesMembro.leitor) temPermissaoBase = true;
            if (funcao.id === 'presidenteReuniao' && tipoReuniaoAtual === 'publica' && permissoesMembro.presidente) temPermissaoBase = true;
        }
        if (!temPermissaoBase) return false; // Se não tem permissão, não é elegível

        // 3. Verifica impedimentos para o mês
        const anoMesImpedimento = `${ano}-${String(mes + 1).padStart(2, '0')}`;
        if (m.impedimentos?.includes(anoMesImpedimento)) return false; // Se está impedido, não é elegível

        // 4. Verifica se já está designado para OUTRA função NESTE MESMO DIA
        const designacoesDoDia = designacoesAtuaisMes[dataStr] || {};
        const jaDesignadoHojeOutraFuncao = Object.entries(designacoesDoDia)
            // Verifica se existe alguma entrada [fId, mId] onde o fId é DIFERENTE da função atual
            // E o mId é igual ao ID do membro que estamos verificando
            .some(([fId, mId]) => fId !== funcao.id && mId === m.id);
        if (jaDesignadoHojeOutraFuncao) return false; // Se já tem outra designação hoje, não é elegível

        // Se passou por todas as verificações, o membro é elegível
        return true;
    });

    // Se não houver elegíveis, retorna null
    if (membrosElegiveis.length === 0) {
        console.log(`Nenhum substituto elegível encontrado para ${funcao.nome} em ${dataStr}.`);
        return null;
    }

    // Ordena os elegíveis usando os mesmos critérios de desempate da função calcularDesignacoes
    // Isso garante que o substituto escolhido seja o "mais apropriado" segundo as regras.
    membrosElegiveis.sort((a, b) => {
        // Critério 0: Penalizar quem fez a MESMA função na reunião ANTERIOR
        let fezReuniaoAnteriorA = false;
        let fezReuniaoAnteriorB = false;
        if (dataAnteriorStr && designacoesAtuaisMes[dataAnteriorStr]) {
            fezReuniaoAnteriorA = designacoesAtuaisMes[dataAnteriorStr][funcao.id] === a.id;
            fezReuniaoAnteriorB = designacoesAtuaisMes[dataAnteriorStr][funcao.id] === b.id;
        }
        if (fezReuniaoAnteriorA && !fezReuniaoAnteriorB) return 1;
        if (!fezReuniaoAnteriorA && fezReuniaoAnteriorB) return -1;

        // Critério 1: Menos vezes para ESTA FUNÇÃO no MÊS ATUAL (usa o cache completo do mês)
        const designacoesFuncaoMesA = contarDesignacoesFuncaoMesAtual(a.id, funcao.id, designacoesAtuaisMes);
        const designacoesFuncaoMesB = contarDesignacoesFuncaoMesAtual(b.id, funcao.id, designacoesAtuaisMes);
        if (designacoesFuncaoMesA !== designacoesFuncaoMesB) {
            return designacoesFuncaoMesA - designacoesFuncaoMesB;
        }

        // Critério 2: Menos vezes TOTAIS (qualquer função) NO MÊS ATUAL (usa o cache completo do mês)
        const designacoesMesA = contarDesignacoesMesAtual(a.id, designacoesAtuaisMes);
        const designacoesMesB = contarDesignacoesMesAtual(b.id, designacoesAtuaisMes);
        if (designacoesMesA !== designacoesMesB) {
            return designacoesMesA - designacoesMesB;
        }

        // Critério 3: Menos vezes no HISTÓRICO PASSADO para ESTA FUNÇÃO
        const historicoPassadoA = contarDesignacoes(a, funcao.id, ano, mes);
        const historicoPassadoB = contarDesignacoes(b, funcao.id, ano, mes);
        if (historicoPassadoA.total !== historicoPassadoB.total) {
            return historicoPassadoA.total - historicoPassadoB.total;
        }

        // Critério 4: Última vez mais antiga no HISTÓRICO PASSADO para ESTA FUNÇÃO
        const ultimaA = historicoPassadoA.ultimaData ? new Date(historicoPassadoA.ultimaData).getTime() : 0;
        const ultimaB = historicoPassadoB.ultimaData ? new Date(historicoPassadoB.ultimaData).getTime() : 0;
        if (ultimaA !== ultimaB) {
            return ultimaA - ultimaB;
        }

        // Critério 5: Sorteio aleatório
        return Math.random() - 0.5;
    });

    // Retorna o primeiro membro da lista ordenada (o melhor substituto)
    console.log(`Melhor substituto encontrado para ${funcao.nome} em ${dataStr}: ${membrosElegiveis[0].nome}`);
    return membrosElegiveis[0];
}

async function realizarSubstituicao(dataStr, funcao, membroOriginalId, substitutoId, targetElement) { // Função agora é async
    const [ano, mesNum] = dataStr.split('-').map(Number);
    const anoMes = `${ano}-${String(mesNum).padStart(2, '0')}`; // YYYY-MM
    const funcaoId = funcao.id;

    console.log(`Realizando substituição: ${dataStr}, ${funcaoId}: ${membroOriginalId} -> ${substitutoId}`);

    // 1. Atualizar o Cache em Memória (designacoesMensaisCache)
    if (designacoesMensaisCache[anoMes] && designacoesMensaisCache[anoMes].designacoesFeitas) {
        if (designacoesMensaisCache[anoMes].designacoesFeitas[dataStr]) {
            // Atualiza o ID do membro para a função específica naquela data no cache
            designacoesMensaisCache[anoMes].designacoesFeitas[dataStr][funcaoId] = substitutoId;
            console.log("Cache do mês atualizado em memória.");
        } else {
            console.warn("Data não encontrada no cache para atualização:", dataStr);
            // Considerar criar a entrada se não existir? Por ora, apenas avisa.
        }
    } else {
        console.warn("Cache não encontrado para o mês da substituição:", anoMes);
        // O cache deveria existir se a geração foi feita.
    }

    // 2. Atualizar a Tabela Visual (Interface)
    const membroSubstituto = membros.find(m => m.id === substitutoId);
    if (membroSubstituto && targetElement) {
        targetElement.textContent = membroSubstituto.nome; // Muda o nome exibido no link
        targetElement.dataset.originalMemberId = substitutoId; // ATUALIZA o data attribute para o novo membro
        console.log("Tabela visual atualizada.");
    } else {
        console.error("Erro ao atualizar tabela visual: Substituto ou elemento target não encontrado.");
    }

    // 3. Atualizar o Histórico nos Objetos de Membro (em memória)
    const membroOriginal = membros.find(m => m.id === membroOriginalId);

    // Remove a designação do histórico do membro original
    if (membroOriginal?.historicoDesignacoes?.[anoMes]?.designacoes?.[dataStr]?.[funcaoId]) {
        delete membroOriginal.historicoDesignacoes[anoMes].designacoes[dataStr][funcaoId];
        console.log(`Histórico removido para membro original: ${membroOriginal.nome}`);
        // Limpa estruturas vazias no histórico (opcional, para manter limpo)
        if (Object.keys(membroOriginal.historicoDesignacoes[anoMes].designacoes[dataStr]).length === 0) {
            delete membroOriginal.historicoDesignacoes[anoMes].designacoes[dataStr];
            if (Object.keys(membroOriginal.historicoDesignacoes[anoMes].designacoes).length === 0) {
                delete membroOriginal.historicoDesignacoes[anoMes];
            }
        }
    } else {
        console.warn(`Não foi possível remover do histórico do membro original (ID: ${membroOriginalId}) - pode já ter sido removido ou não existia.`);
    }

    // Adiciona a designação ao histórico do membro substituto
    if (membroSubstituto) {
        if (!membroSubstituto.historicoDesignacoes) membroSubstituto.historicoDesignacoes = {};
        if (!membroSubstituto.historicoDesignacoes[anoMes]) membroSubstituto.historicoDesignacoes[anoMes] = { designacoes: {} };
        if (!membroSubstituto.historicoDesignacoes[anoMes].designacoes[dataStr]) membroSubstituto.historicoDesignacoes[anoMes].designacoes[dataStr] = {};
        membroSubstituto.historicoDesignacoes[anoMes].designacoes[dataStr][funcaoId] = substitutoId; // Adiciona a entrada
        console.log(`Histórico adicionado/atualizado para membro substituto: ${membroSubstituto.nome}`);
    } else {
        console.error(`Não foi possível adicionar ao histórico do membro substituto (ID: ${substitutoId}) - membro não encontrado.`);
    }

    // 4. Salvar as Alterações no IndexedDB
    try {
        await salvarMembrosLocalmente(); // Salva o array 'membros' atualizado (com históricos modificados)
        alert("Substituição realizada e histórico atualizado com sucesso!");
    } catch (error) {
        console.error("Falha ao salvar alterações da substituição no IndexedDB:", error);
        alert("A substituição foi feita na tela, mas ocorreu um erro ao salvar as alterações no banco de dados local. O histórico pode não ter sido atualizado permanentemente.");
        // Considerar recarregar os dados para garantir consistência?
    }
}


// --- FUNÇÃO PARA EXPORTAR PDF (AJUSTADA PARA APROXIMAR TÍTULO DA TABELA v2) ---
function exportarPDF() {
    // 1. Verifica se o construtor jsPDF está disponível globalmente
    if (typeof window.jspdf?.jsPDF !== 'function') {
        alert("Erro: A biblioteca jsPDF principal não foi carregada corretamente. Verifique o console para mais detalhes.");
        console.error("jsPDF constructor (window.jspdf.jsPDF) not found.", window.jspdf);
        return;
    }
    const jsPDF = window.jspdf.jsPDF; // Pega o construtor

    // Adiciona um pequeno delay para dar tempo ao plugin AutoTable de se anexar à instância jsPDF
    setTimeout(() => {
        console.log("Tentando exportar PDF dentro do setTimeout...");

        // Obtém mês e ano selecionados para o título e nome do arquivo
        const mesSelecionadoIndex = parseInt(document.getElementById('mesSelect').value);
        const anoSelecionado = document.getElementById('anoInput').value;
        const nomeMes = NOMES_MESES[mesSelecionadoIndex];
        const nomeArquivo = `designacoes_${nomeMes}_${anoSelecionado}.pdf`;

        // Verifica se as tabelas de designação foram geradas
        const resultadoContainer = document.getElementById('resultadoDesignacoes');
        if (!resultadoContainer || !resultadoContainer.querySelector('.table-designacoes')) { // Verifica se existe alguma tabela
            alert("Gere as designações primeiro antes de exportar para PDF.");
            return;
        }

        // Cria a instância do documento PDF DENTRO do setTimeout
        const doc = new jsPDF({
            orientation: 'portrait', // Orientação retrato
            unit: 'pt', // Unidade em pontos
            format: 'a4' // Formato A4
        });

        // 2. Verifica se o método autoTable existe na *instância* do doc DENTRO do setTimeout
        if (typeof doc.autoTable !== 'function') {
            alert("Erro: O plugin jsPDF-AutoTable ainda não está pronto ou falhou ao carregar. Tente novamente em alguns segundos ou verifique o console.");
            console.error("doc.autoTable is not a function even after setTimeout. Plugin might not have attached.", doc);
            try {
                console.log("Inspecting jsPDF.API.prototype inside setTimeout:", jsPDF.API.prototype);
            } catch (e) {
                console.error("Could not inspect jsPDF.API.prototype inside setTimeout:", e);
            }
            return;
        }

        console.log("jsPDF e doc.autoTable parecem disponíveis. Prosseguindo com a geração das tabelas...");

        // --- Configurações do PDF ---
        const tituloPrincipal = `Designações para ${nomeMes} de ${anoSelecionado}`;
        const pageWidth = doc.internal.pageSize.getWidth(); // Largura da página
        const pageHeight = doc.internal.pageSize.getHeight(); // Altura da página
        const margin = 40; // Margem padrão
        const headerColor = [63, 114, 128]; // Cor --jw-teal (RGB)
        const headerHeight = 40; // Altura da faixa do cabeçalho
        let finalY = 0; // Variável para rastrear a posição Y atual no documento

        // --- Desenha a Faixa do Cabeçalho ---
        doc.setFillColor(headerColor[0], headerColor[1], headerColor[2]); // Define a cor de preenchimento
        doc.rect(0, 0, pageWidth, headerHeight, 'F'); // Desenha o retângulo preenchido ('F')

        // --- Desenha o Título Principal na Faixa ---
        doc.setFontSize(16); // Tamanho da fonte para o título
        doc.setTextColor(255, 255, 255); // Cor do texto branca
        doc.text(tituloPrincipal, pageWidth / 2, headerHeight / 2 + 5, { align: 'center' });
        finalY = headerHeight; // Atualiza a posição Y para abaixo da faixa

        // Reseta a cor do texto para o padrão (preto)
        doc.setTextColor(0, 0, 0);

        // --- Calcula a largura das colunas das tabelas ---
        const dataColumnWidth = 55; // Largura fixa e menor para a coluna de data
        const remainingWidth = pageWidth - (margin * 2) - dataColumnWidth;
        const nameColumnWidth = remainingWidth / 2; // Divide o espaço restante igualmente

        // Seleciona todas as tabelas de designação e seus títulos do HTML gerado
        const tabelasHtml = resultadoContainer.querySelectorAll('.table-designacoes');
        const titulosTabelasHtml = resultadoContainer.querySelectorAll('h4.table-title');
        let errorOccurred = false; // Flag para controlar se ocorreu erro durante a geração

        // --- Define os espaçamentos entre os elementos no PDF ---
        const spaceAfterHeader = 50;       // Espaço inicial após o cabeçalho principal
        const spaceBetweenSections = 50; // *** REDUZIDO: Espaço entre o fim de uma tabela e o início da próxima seção (título+tabela) ***
        const spaceBetweenTitleAndTable = 6;  // *** AJUSTADO: Espaço MÍNIMO entre o TÍTULO e a TABELA ABAIXO ***

        finalY += spaceAfterHeader; // Adiciona o espaço inicial após o cabeçalho

        // --- Itera sobre cada tabela HTML encontrada ---
        tabelasHtml.forEach((tabelaHtml, index) => {
            if (errorOccurred) return; // Pula se já ocorreu um erro

            // --- Calcula a Posição Y Inicial da TABELA ---
            // A posição inicial da tabela será a posição final do elemento anterior (finalY)
            // mais o espaçamento entre seções (se não for a primeira tabela).
            let tableStartY = finalY;
            if (index > 0) {
                // Adiciona espaço ANTES de começar a seção da tabela/título
                tableStartY += spaceBetweenSections;
            }

            // --- Obtém e Formata o Título da Tabela ---
            let tituloTabela;
            // Tratamento especial para o título da terceira tabela (Leitor/Presidente)
            if (index === 2) {
                tituloTabela = "LEITOR/PRESIDENTE";
            } else {
                // Obtém o texto do H4 correspondente, remove o ícone e converte para maiúsculas
                const tituloOriginal = titulosTabelasHtml[index] ? titulosTabelasHtml[index].textContent.trim() : `TABELA ${index + 1}`;
                tituloTabela = tituloOriginal.replace(/<i.*?<\/i>\s*/, '').toUpperCase();
            }

            // --- Calcula a Posição Y do TÍTULO (ACIMA da tabela) ---
            doc.setFontSize(11); // Define o tamanho da fonte para calcular a altura
            const titleHeight = doc.getTextDimensions(tituloTabela, { fontSize: 11 }).h;
            // Posiciona o título um pouco acima do início da tabela (tableStartY)
            // A base do texto do título ficará em 'titleY'
            const titleY = tableStartY - spaceBetweenTitleAndTable; // Título fica ACIMA da tableStartY

            // --- Desenha o Título da Seção ---
            doc.setFont(undefined, 'bold'); // Define a fonte como negrito
            doc.text(tituloTabela, margin, titleY, { align: 'left', baseline: 'bottom' }); // Alinha pela base para ficar mais próximo
            doc.setFont(undefined, 'normal'); // Retorna a fonte ao normal

            // --- Extrai Dados da Tabela HTML ---
            const head = Array.from(tabelaHtml.querySelectorAll('thead th')).map(th => th.textContent.trim());
            const body = Array.from(tabelaHtml.querySelectorAll('tbody tr')).map(tr => {
                return Array.from(tr.querySelectorAll('td')).map(td => {
                    if (td.classList.contains('data-cell')) {
                        const diaNum = td.querySelector('.dia-numero')?.textContent || '';
                        const diaSem = td.querySelector('.badge')?.textContent || '';
                        return `${diaNum} ${diaSem}`.trim();
                    }
                    const idMembro = td.querySelector('a.nome-substituivel')?.dataset.originalMemberId;
                    if (idMembro) {
                        return obterNomeMembro(idMembro);
                    }
                    return td.textContent.trim();
                });
            });

            // --- Desenha a Tabela usando autoTable ---
            try {
                doc.autoTable({
                    head: [head],
                    body: body,
                    startY: tableStartY, // A tabela começa na posição calculada originalmente
                    theme: 'grid',
                    headStyles: {
                        fillColor: [63, 114, 128],
                        textColor: 255,
                        fontStyle: 'bold',
                        halign: 'center'
                    },
                    styles: {
                        cellPadding: 5,
                        fontSize: 9,
                        valign: 'middle',
                        overflow: 'linebreak'
                    },
                    columnStyles: {
                        0: { cellWidth: dataColumnWidth, halign: 'center' },
                        1: { cellWidth: nameColumnWidth, halign: 'center' },
                        2: { cellWidth: nameColumnWidth, halign: 'center' },
                    },
                    alternateRowStyles: {
                        fillColor: [245, 245, 245]
                    },
                    margin: { left: margin, right: margin }
                });
                // Atualiza finalY para a posição Y logo após a tabela desenhada
                finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : tableStartY + 50; // Usa a propriedade finalY do autoTable ou estima
            } catch (e) {
                console.error("Erro durante a chamada doc.autoTable() para a tabela:", tituloTabela, e);
                alert(`Ocorreu um erro ao gerar a tabela "${tituloTabela}" no PDF. Verifique o console.`);
                errorOccurred = true;
                // Se der erro, tentamos resetar finalY para antes da tentativa da seção
                finalY = tableStartY - spaceBetweenSections; // Volta para o final da seção anterior
                if (index === 0) finalY = headerHeight + spaceAfterHeader; // Caso especial da primeira tabela
            }
        }); // Fim do loop forEach para tabelas

        // --- Salva o PDF ---
        if (!errorOccurred) {
            try {
                doc.save(nomeArquivo); // Inicia o download do arquivo PDF
                console.log(`PDF "${nomeArquivo}" gerado e download iniciado.`);
            } catch (e) {
                console.error("Erro ao salvar o PDF:", e);
                alert("Ocorreu um erro ao tentar salvar o arquivo PDF.");
            }
        } else {
            console.warn("A exportação do PDF foi abortada devido a erros na geração das tabelas.");
        }

    }, 200); // Mantém o delay
}


// --- Inicialização da Aplicação ---
document.addEventListener('DOMContentLoaded', async () => { // Event listener agora é async
    console.log("DOM carregado. Iniciando script.");

    try {
        // 1. Abrir (ou criar) o banco de dados IndexedDB
        await abrirBancoDeDados(); // Espera o banco de dados estar pronto

        // 2. Carregar membros salvos do IndexedDB para a memória
        await carregarMembrosLocalmente(); // Espera os membros serem carregados

        // 3. Inicializar os modais do Bootstrap
        inicializarModal(); // Modal individual
        inicializarModalMassa(); // Modal em massa

        // 4. Preencher selects de Mês (principal e impedimento)
        const mesSelectPrincipal = document.getElementById('mesSelect');
        const mesSelectImpedimento = document.getElementById('impedimentoMes');
        const anoAtual = new Date().getFullYear();
        const mesAtual = new Date().getMonth(); // 0-11

        if (mesSelectPrincipal) mesSelectPrincipal.innerHTML = ''; // Limpa opções existentes
        if (mesSelectImpedimento) mesSelectImpedimento.innerHTML = ''; // Limpa opções existentes

        NOMES_MESES.forEach((nome, index) => {
            // Opção para o select principal (valor 0-11)
            const optionPrincipal = document.createElement('option');
            optionPrincipal.value = index;
            optionPrincipal.textContent = nome;
            if (mesSelectPrincipal) mesSelectPrincipal.appendChild(optionPrincipal);

            // Opção para o select de impedimento (valor '01'-'12')
            const optionImpedimento = document.createElement('option');
            optionImpedimento.value = String(index + 1).padStart(2, '0'); // Garante 2 dígitos
            optionImpedimento.textContent = nome;
            if (mesSelectImpedimento) mesSelectImpedimento.appendChild(optionImpedimento);
        });

        // Define o mês/ano atual como padrão nos selects principais
        if (mesSelectPrincipal) mesSelectPrincipal.value = mesAtual;
        const anoInputPrincipal = document.getElementById('anoInput');
        if (anoInputPrincipal) anoInputPrincipal.value = anoAtual;

        // Define o ano atual como padrão no input de ano do impedimento
        const anoInputImpedimento = document.getElementById('impedimentoAno');
        if (anoInputImpedimento) anoInputImpedimento.value = anoAtual;


        // 5. Adicionar Listeners de Eventos
        // Limpa o resultado mensal quando mês ou ano mudam
        if (mesSelectPrincipal) mesSelectPrincipal.addEventListener('change', limparResultadoMensal);
        if (anoInputPrincipal) anoInputPrincipal.addEventListener('change', limparResultadoMensal);

        // Listener para o input de arquivo de importação
        const inputFile = document.getElementById('importarArquivo');
        if (inputFile) {
            inputFile.addEventListener('change', importarMembrosDeArquivo); // Chama a função de importação
        } else {
            console.warn("Elemento input 'importarArquivo' não encontrado.");
        }

        // Listener para o botão Exportar PDF
        const btnExportarPDF = document.getElementById('btnExportarPDF');
        if (btnExportarPDF) {
            btnExportarPDF.addEventListener('click', exportarPDF); // Chama a função de exportação PDF
        } else {
            console.warn("Botão 'btnExportarPDF' não encontrado.");
        }

        // 6. Renderizar a tabela de membros inicial e limpar a área de resultados
        renderizarTabelaMembros();
        limparResultadoMensal();

        console.log("Interface inicial pronta.");

    } catch (error) {
        // Captura erros durante a inicialização (abertura do DB, carregamento inicial)
        console.error("Erro crítico durante a inicialização:", error);
        alert(`Ocorreu um erro grave ao inicializar a aplicação: ${error.message}. Alguns recursos podem não funcionar corretamente. Verifique o console para detalhes.`);
        // Tenta renderizar a tabela mesmo em caso de erro (pode estar vazia)
        renderizarTabelaMembros();
        limparResultadoMensal();
    }
});


// --- Funções de Importação/Exportação (Melhoradas) ---

/**
 * Exporta os dados dos membros (do array em memória) para um arquivo JSON.
 */
function exportarMembrosParaArquivo() {
    // Verifica se há membros em memória para exportar
    if (!membros || membros.length === 0) {
        alert("Nenhum membro cadastrado para exportar.");
        return;
    }

    // Cria um nome de arquivo com timestamp
    const timestamp = new Date().toISOString().replace(/[:.-]/g, '').slice(0, 15); // Formato YYYYMMDDTHHMMSS
    const nomeArquivo = `membros_backup_${timestamp}.json`;

    try {
        // Converte o array de membros para uma string JSON formatada (com indentação)
        const dadosJson = JSON.stringify(membros, null, 2); // null, 2 para pretty print

        // Cria um Blob (Binary Large Object) com os dados JSON
        const blob = new Blob([dadosJson], { type: "application/json;charset=utf-8" });

        // Cria uma URL temporária para o Blob
        const url = URL.createObjectURL(blob);

        // Cria um link <a> invisível para iniciar o download
        const a = document.createElement("a");
        a.href = url;
        a.download = nomeArquivo; // Define o nome do arquivo para download
        document.body.appendChild(a); // Adiciona o link ao corpo do documento
        a.click(); // Simula o clique no link para iniciar o download

        // Limpa a URL temporária e remove o link
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`Membros exportados para ${nomeArquivo}`);
        alert(`Backup dos membros (${membros.length}) exportado com sucesso como "${nomeArquivo}".`);

    } catch (error) {
        console.error("Erro ao exportar membros para JSON:", error);
        alert("Ocorreu um erro ao tentar exportar os dados. Verifique o console.");
    }
}


/**
 * Importa membros a partir de um arquivo JSON selecionado pelo usuário.
 * Substitui os membros atuais pelos importados após confirmação.
 * @param {Event} event O evento 'change' do input de arquivo.
 */
async function importarMembrosDeArquivo(event) { // Função agora é async
    const file = event.target.files[0]; // Pega o arquivo selecionado
    if (!file) return; // Sai se nenhum arquivo foi selecionado

    // Verifica se o tipo do arquivo é JSON
    if (file.type !== "application/json") {
        alert("Por favor, selecione um arquivo .json válido.");
        event.target.value = ''; // Limpa o input de arquivo
        return;
    }

    const reader = new FileReader(); // Cria um leitor de arquivo

    // Função chamada quando a leitura do arquivo for concluída
    reader.onload = async (e) => { // onload agora é async
        let dadosImportados;
        try {
            // Tenta parsear o conteúdo do arquivo como JSON
            dadosImportados = JSON.parse(e.target.result);

            // --- Validação Estrutural dos Dados Importados ---
            if (!Array.isArray(dadosImportados)) {
                throw new Error("O arquivo não contém um array (lista) de membros válido.");
            }

            if (dadosImportados.length === 0) {
                if (!confirm("O arquivo selecionado está vazio ou não contém membros. Deseja limpar a lista atual de membros?")) {
                    event.target.value = '';
                    return;
                }
                // Se confirmar, continua para limpar os dados existentes
            } else {
                // Validação mais profunda da estrutura de alguns membros (amostra)
                let estruturaBasicaOk = true;
                const amostra = dadosImportados.slice(0, Math.min(dadosImportados.length, 5)); // Pega até 5 membros
                for (const membroTeste of amostra) {
                    if (typeof membroTeste !== 'object' || membroTeste === null || typeof membroTeste.nome !== 'string') {
                        estruturaBasicaOk = false;
                        break;
                    }
                    // Poderia adicionar mais verificações aqui (permissoesBase é objeto, historico é objeto, etc.)
                }
                if (!estruturaBasicaOk) {
                    throw new Error("A estrutura dos dados do membro no arquivo parece inválida. Verifique se cada membro é um objeto com pelo menos a propriedade 'nome' (texto).");
                }
            }


            // --- Confirmação do Usuário (se já existirem dados) ---
            if (membros.length > 0) {
                if (!confirm(`Atenção!\n\nIsso substituirá os ${membros.length} membros atuais pelos ${dadosImportados.length} membros do arquivo "${file.name}".\n\nTem certeza que deseja continuar?`)) {
                    event.target.value = ''; // Limpa o input se o usuário cancelar
                    return; // Aborta a importação
                }
            } else if (dadosImportados.length === 0) {
                // Se não havia membros e o arquivo está vazio, apenas informa
                alert("O arquivo importado está vazio e não havia membros cadastrados. A lista permanecerá vazia.");
                event.target.value = '';
                return;
            }

            // --- Processamento e Validação Individual ---
            console.log(`Processando ${dadosImportados.length} membros do arquivo...`);
            const nomesUnicos = new Set();
            const membrosProcessados = [];
            let errosValidacao = 0;
            let nomesDuplicadosIgnorados = 0;

            for (const membroImportado of dadosImportados) {
                try {
                    // Valida a estrutura de cada membro individualmente
                    const membroValidado = validarEstruturaMembro(membroImportado, true); // Gera ID se necessário

                    // Verifica nomes duplicados DENTRO do arquivo importado
                    const nomeLowerCase = membroValidado.nome.toLowerCase();
                    if (nomesUnicos.has(nomeLowerCase)) {
                        console.warn(`Nome duplicado encontrado no arquivo: "${membroValidado.nome}". Membro ignorado.`);
                        nomesDuplicadosIgnorados++;
                        continue; // Pula para o próximo membro
                    }
                    nomesUnicos.add(nomeLowerCase);
                    membrosProcessados.push(membroValidado);

                } catch (validationError) {
                    console.error(`Erro ao validar membro durante importação: ${validationError.message}`, membroImportado);
                    errosValidacao++;
                }
            }

            if (errosValidacao > 0) {
                alert(`Atenção: ${errosValidacao} membro(s) no arquivo continham dados inválidos e foram ignorados. Verifique o console para detalhes.`);
            }
            if (nomesDuplicadosIgnorados > 0) {
                alert(`Atenção: ${nomesDuplicadosIgnorados} membro(s) com nomes duplicados dentro do arquivo foram ignorados.`);
            }


            // --- Atualização dos Dados e Persistência ---
            membros = membrosProcessados; // Substitui o array em memória pelos membros processados

            await salvarMembrosLocalmente(); // Salva a nova lista no IndexedDB

            // --- Feedback Final e Atualização da Interface ---
            renderizarTabelaMembros(); // Atualiza a tabela na interface
            limparResultadoMensal(); // Limpa a área de designações
            alert(`${membros.length} membros importados com sucesso do arquivo "${file.name}"!`);
            console.log("Membros importados e salvos no IndexedDB.");

        } catch (error) {
            // Captura erros gerais (falha no parse JSON, erros inesperados)
            console.error("Erro ao importar arquivo:", error);
            alert(`Erro ao processar o arquivo JSON "${file.name}":\n${error.message}\n\nVerifique se o arquivo está no formato correto e tente novamente.`);
            // Não altera os dados existentes se a importação falhar
        } finally {
            // Limpa o input de arquivo independentemente do resultado
            event.target.value = '';
        }
    };

    // Função chamada se ocorrer um erro ao LER o arquivo
    reader.onerror = (e) => {
        console.error("Erro ao ler o arquivo:", e);
        alert(`Ocorreu um erro ao tentar ler o arquivo "${file.name}".`);
        event.target.value = ''; // Limpa o input
    };

    // Inicia a leitura do arquivo como texto UTF-8
    reader.readAsText(file, 'UTF-8');
}

/**
 * Função auxiliar para validar a estrutura do histórico de designações importado.
 * Garante que o histórico tenha o formato esperado.
 * @param {any} historico O valor lido do campo 'historicoDesignacoes'.
 * @returns {object} Um objeto de histórico validado (pode ser vazio {}).
 */
function validarHistoricoImportado(historico) {
    // Se não for um objeto ou for nulo, retorna um objeto vazio
    if (typeof historico !== 'object' || historico === null) {
        return {};
    }

    const historicoValidado = {};
    // Itera sobre as chaves do histórico (espera-se YYYY-MM)
    Object.entries(historico).forEach(([anoMes, dadosMes]) => {
        // Valida o formato da chave YYYY-MM
        if (typeof anoMes === 'string' && anoMes.match(/^\d{4}-\d{2}$/)) {
            // Valida se os dados do mês são um objeto e contêm a chave 'designacoes' como objeto
            if (typeof dadosMes === 'object' && dadosMes !== null && typeof dadosMes.designacoes === 'object' && dadosMes.designacoes !== null) {
                const designacoesValidadas = {};
                // Itera sobre as chaves das designações (espera-se YYYY-MM-DD)
                Object.entries(dadosMes.designacoes).forEach(([dataStr, funcoesDoDia]) => {
                    // Valida o formato da chave YYYY-MM-DD
                    if (typeof dataStr === 'string' && dataStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        // Valida se as funções do dia são um objeto
                        if (typeof funcoesDoDia === 'object' && funcoesDoDia !== null) {
                            // Poderia adicionar validação extra aqui para garantir que os valores são IDs de membros válidos,
                            // mas por ora, apenas copia o objeto se a estrutura básica estiver correta.
                            designacoesValidadas[dataStr] = funcoesDoDia;
                        }
                    }
                });
                // Adiciona ao histórico validado apenas se houver designações válidas para este mês/ano
                if (Object.keys(designacoesValidadas).length > 0) {
                    historicoValidado[anoMes] = { designacoes: designacoesValidadas };
                }
            }
        } else {
            console.warn(`Chave de histórico inválida encontrada e ignorada: ${anoMes}`);
        }
    });
    // Retorna o objeto de histórico contendo apenas as entradas validadas
    return historicoValidado;
}
