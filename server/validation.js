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

function validarMeta(body) {
  body = body || {};
  const errors = [];

  const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
  if (!nome || nome.length > 100) {
    errors.push('nome e obrigatorio e deve ter ate 100 caracteres');
  }

  const quantidade = Number(body.quantidade);
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    errors.push('quantidade deve ser um numero inteiro positivo');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: { nome, quantidade } };
}

function validarConfigPrecos(body) {
  body = body || {};
  const errors = [];

  const precoCompra = Number(body.preco_compra);
  if (!Number.isFinite(precoCompra) || precoCompra <= 0) {
    errors.push('preco_compra deve ser um numero positivo');
  }

  const precoVenda = Number(body.preco_venda);
  if (!Number.isFinite(precoVenda) || precoVenda <= 0) {
    errors.push('preco_venda deve ser um numero positivo');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: { preco_compra: precoCompra, preco_venda: precoVenda } };
}

function validarConfigAlertas(body) {
  body = body || {};
  const errors = [];

  const whatsappNumero =
    typeof body.whatsapp_numero === 'string' ? body.whatsapp_numero.replace(/\D/g, '') : '';
  if (whatsappNumero.length > 0 && whatsappNumero.length < 10) {
    errors.push('whatsapp_numero deve ter ao menos 10 digitos (DDD + numero)');
  }

  const estoqueMinimo = Number(body.estoque_minimo);
  if (!Number.isInteger(estoqueMinimo) || estoqueMinimo <= 0) {
    errors.push('estoque_minimo deve ser um numero inteiro positivo');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: { whatsapp_numero: whatsappNumero, estoque_minimo: estoqueMinimo },
  };
}

module.exports = {
  validarMovimentacao,
  validarLogin,
  validarSenha,
  validarMeta,
  validarConfigPrecos,
  validarConfigAlertas,
};
