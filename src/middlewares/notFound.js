// Qualquer rota não registrada cai aqui e recebe um 404 em JSON.
module.exports = (req, res) => {
  res.status(404).json({
    error: 'NotFound',
    message: `Rota ${req.method} ${req.originalUrl} não encontrada`,
  });
};
