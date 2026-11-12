const express = require('express');
const request = require('supertest');
const { createApp } = require('../src/app');
const errorHandler = require('../src/middlewares/errorHandler');
const config = require('../src/config');

describe('Rotas inexistentes', () => {
  it('respondem 404 em JSON', async () => {
    const res = await request(createApp()).get('/nao-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: 'NotFound',
      message: 'Rota GET /nao-existe não encontrada',
    });
  });
});

describe('errorHandler', () => {
  // App mínima que lança o erro que quisermos, para testar o middleware isolado.
  const appThatThrows = (err) => {
    const app = express();
    app.get('/boom', () => {
      throw err;
    });
    app.use(errorHandler);
    return app;
  };

  const originalEnv = config.env;
  afterEach(() => {
    config.env = originalEnv;
  });

  beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterAll(() => console.error.mockRestore());

  it('repassa erros de cliente (4xx) com a mensagem original', async () => {
    const err = Object.assign(new Error('Campo obrigatório'), { name: 'ValidationError', status: 400 });
    const res = await request(appThatThrows(err)).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'ValidationError', message: 'Campo obrigatório' });
  });

  it('esconde detalhes de erros 500 em produção', async () => {
    config.env = 'production';
    const res = await request(appThatThrows(new Error('senha do banco: 123'))).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'InternalServerError', message: 'Erro interno no servidor' });
    expect(JSON.stringify(res.body)).not.toContain('senha');
  });

  it('mostra o detalhe de erros 500 fora de produção, para depuração', async () => {
    config.env = 'development';
    const res = await request(appThatThrows(new Error('falha X'))).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.detail).toBe('falha X');
  });
});
