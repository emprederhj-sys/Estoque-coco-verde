const TIPOS_VALIDOS = ['entrada', 'saida'];
const PAPEIS_VALIDOS = ['dono', 'funcionario'];
const MAX_TEXTO = 200;

function limitarTexto(valor) {
  return typeof valor === 'string' ? valor.trim().slice(0, MAX_TEXTO) : '';
}

function validarMovimentacao(body) {
  body = body || {};
  const errors = [];

  if (!TIPOS_VALIDOS.includes(body.tipo)) {
    errors.push(`tipo deve ser um de: ${TIPOS_VALIDOS.join(', ')}`);
  }

  const quantidade = Number(body.quantidade);
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    errors.push('quantidade deve ser um numero inteiro positivo');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: {
      tipo: body.tipo,
      quantidade,
      detalhe: limitarTexto(body.detalhe),
      observacao: limitarTexto(body.observacao),
      usuario: limitarTexto(body.usuario),
    },
  };
}

function validarLogin(body) {
  body = body || {};
  const errors = [];

  if (!PAPEIS_VALIDOS.includes(body.papel)) {
    errors.push(`papel deve ser um de: ${PAPEIS_VALIDOS.join(', ')}`);
  }
  if (typeof body.senha !== 'string' || body.senha.length === 0) {
    errors.push('senha e obrigatoria');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: { papel: body.papel, senha: body.senha } };
}

function validarSenha(body) {
  body = body || {};
  const errors = [];

  if (!PAPEIS_VALIDOS.includes(body.papel)) {
    errors.push(`papel deve ser um de: ${PAPEIS_VALIDOS.join(', ')}`);
  }
  if (typeof body.novaSenha !== 'string' || body.novaSenha.length < 4) {
    errors.push('novaSenha deve ter pelo menos 4 caracteres');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: { papel: body.papel, novaSenha: body.novaSenha } };
}

module.exports = { validarMovimentacao, validarLogin, validarSenha };
