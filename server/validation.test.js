const { test } = require('node:test');
const assert = require('node:assert');
const { validarMovimentacao, validarLogin } = require('./validation');

test('validarMovimentacao aceita dados validos e sanitiza texto', () => {
  const result = validarMovimentacao({
    tipo: 'entrada',
    quantidade: '10',
    detalhe: '  Fornecedor X  ',
    observacao: '',
    usuario: 'Ana',
  });

  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.data, {
    tipo: 'entrada',
    quantidade: 10,
    detalhe: 'Fornecedor X',
    observacao: '',
    usuario: 'Ana',
  });
});

test('validarMovimentacao rejeita tipo fora de entrada/saida', () => {
  const result = validarMovimentacao({ tipo: 'transferencia', quantidade: 5 });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('validarMovimentacao rejeita quantidade zero ou negativa', () => {
  assert.strictEqual(validarMovimentacao({ tipo: 'saida', quantidade: 0 }).valid, false);
  assert.strictEqual(validarMovimentacao({ tipo: 'saida', quantidade: -3 }).valid, false);
});

test('validarMovimentacao rejeita quantidade nao numerica', () => {
  const result = validarMovimentacao({ tipo: 'entrada', quantidade: 'abc' });
  assert.strictEqual(result.valid, false);
});

test('validarLogin rejeita papel invalido', () => {
  const result = validarLogin({ papel: 'admin', senha: '123456' });
  assert.strictEqual(result.valid, false);
});

test('validarLogin rejeita senha vazia', () => {
  const result = validarLogin({ papel: 'dono', senha: '' });
  assert.strictEqual(result.valid, false);
});

test('validarLogin aceita papel e senha validos', () => {
  const result = validarLogin({ papel: 'dono', senha: 'dono123' });
  assert.deepStrictEqual(result, {
    valid: true,
    errors: [],
    data: { papel: 'dono', senha: 'dono123' },
  });
});
