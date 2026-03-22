import express from 'express';
import cors from 'cors';
import { neon } from '@neondatabase/serverless';

const app = express();
app.use(cors());
app.use(express.json());

const getDB = () => {
  const url = process.env.POSTGRES_CONNECTION_URL;
  if (!url) throw new Error('POSTGRES_CONNECTION_URL não configurada');
  return neon(url);
};

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/dashboard', async (req, res) => {
  try {
    const sql = getDB();
    const { startDate, endDate, sector = 'all' } = req.body;
    const vendas = await sql`
      SELECT EXTRACT(YEAR FROM data) as ano, SUM(valor_total) as total, COUNT(*) as registros
      FROM vendas
      WHERE data BETWEEN ${startDate} AND ${endDate}
      GROUP BY ano ORDER BY ano
    `;
    res.json({ vendas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vendas', async (req, res) => {
  try {
    const sql = getDB();
    const { startDate, endDate, sector = 'all' } = req.body;
    let result;
    if (sector === 'all') {
      result = await sql`
        SELECT data, valor_total, produto_id FROM vendas
        WHERE data BETWEEN ${startDate} AND ${endDate}
        ORDER BY data DESC LIMIT 1000
      `;
    } else {
      result = await sql`
        SELECT v.data, v.valor_total, v.produto_id FROM vendas v
        JOIN produtos p ON v.produto_id = p.id
        WHERE v.data BETWEEN ${startDate} AND ${endDate} AND p.setor = ${sector}
        ORDER BY v.data DESC LIMIT 1000
      `;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/perdas', async (req, res) => {
  try {
    const sql = getDB();
    const { startDate, endDate } = req.body;
    const result = await sql`
      SELECT * FROM perdas
      WHERE data BETWEEN ${startDate} AND ${endDate}
      ORDER BY data DESC LIMIT 1000
    `;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/produtos', async (req, res) => {
  try {
    const sql = getDB();
    const result = await sql`SELECT * FROM produtos ORDER BY nome`;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
