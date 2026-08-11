const { test } = require('node:test');
const assert = require('node:assert');
const { validarMovimentacao, validarLogin, validarSenha, validarMeta } = require('./validation');

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

test('validarSenha rejeita papel invalido', () => {
  const result = validarSenha({ papel: 'admin', novaSenha: '1234' });
  assert.strictEqual(result.valid, false);
});

test('validarSenha rejeita senha curta', () => {
  const result = validarSenha({ papel: 'dono', novaSenha: '123' });
  assert.strictEqual(result.valid, false);
});

test('validarSenha aceita papel e senha validos', () => {
  const result = validarSenha({ papel: 'funcionario', novaSenha: 'nova1234' });
  assert.deepStrictEqual(result, {
    valid: true,
    errors: [],
    data: { papel: 'funcionario', novaSenha: 'nova1234' },
  });
});

test('validarMeta aceita nome e quantidade validos', () => {
  const result = validarMeta({ nome: '  Meta 500  ', quantidade: '500' });
  assert.deepStrictEqual(result, {
    valid: true,
    errors: [],
    data: { nome: 'Meta 500', quantidade: 500 },
  });
});

test('validarMeta rejeita nome vazio', () => {
  assert.strictEqual(validarMeta({ nome: '  ', quantidade: 10 }).valid, false);
});

test('validarMeta rejeita quantidade zero ou negativa', () => {
  assert.strictEqual(validarMeta({ nome: 'Meta', quantidade: 0 }).valid, false);
  assert.strictEqual(validarMeta({ nome: 'Meta', quantidade: -5 }).valid, false);
});
