const NOMES_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const NOMES_DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_REUNIAO = { meioSemana: 4, publica: 0 };

const PERMISSOES_BASE = [
  { id: 'indicadorQui', nome: 'Indicador (Qui)', grupo: 'Indicadores' },
  { id: 'indicadorDom', nome: 'Indicador (Dom)', grupo: 'Indicadores' },
  { id: 'volanteQui', nome: 'Volante (Qui)', grupo: 'Volantes' },
  { id: 'volanteDom', nome: 'Volante (Dom)', grupo: 'Volantes' },
  { id: 'leitor', nome: 'Leitor', grupo: 'Outros' },
  { id: 'presidente', nome: 'Presidente', grupo: 'Outros' }
];

const FUNCOES_DESIGNADAS = [
  { id: 'indicadorExterno', nome: 'Indicador Externo', tipoReuniao: ['meioSemana', 'publica'], tabela: 'Indicadores' },
  { id: 'indicadorPalco', nome: 'Indicador Palco', tipoReuniao: ['meioSemana', 'publica'], tabela: 'Indicadores' },
  { id: 'volante1', nome: 'Volante 1', tipoReuniao: ['meioSemana', 'publica'], tabela: 'Volantes' },
  { id: 'volante2', nome: 'Volante 2', tipoReuniao: ['meioSemana', 'publica'], tabela: 'Volantes' },
  { id: 'leitorSentinela', nome: 'Leitor Sentinela', tipoReuniao: ['publica'], tabela: 'LeitorPresidente' },
  { id: 'presidenteReuniao', nome: 'Presidente', tipoReuniao: ['publica'], tabela: 'LeitorPresidente' }
];
