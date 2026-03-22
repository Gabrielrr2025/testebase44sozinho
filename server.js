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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Diagnóstico
app.get('/api/diagnostico', async (req, res) => {
  try {
    const sql = getDB();
    const vendas = await sql`SELECT COUNT(*) as total FROM vendas`;
    const perdas = await sql`SELECT COUNT(*) as total FROM perdas`;
    const produtos = await sql`SELECT COUNT(*) as total FROM produtos`;
    res.json({ vendas: vendas[0], perdas: perdas[0], produtos: produtos[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard
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

// Vendas
app.post('/api/vendas', async (req, res) => {
  try {
    const sql = getDB();
    const { startDate, endDate, sector = 'all' } = req.body;
    let result;
    if (sector === 'all') {
      result = await sql`
        SELECT v.data, v.valor_total, v.produto_id, p.nome as produto_nome, p.setor
        FROM vendas v
        LEFT JOIN produtos p ON v.produto_id = p.id
        WHERE v.data BETWEEN ${startDate} AND ${endDate}
        ORDER BY v.data DESC LIMIT 5000
      `;
    } else {
      result = await sql`
        SELECT v.data, v.valor_total, v.produto_id, p.nome as produto_nome, p.setor
        FROM vendas v
        JOIN produtos p ON v.produto_id = p.id
        WHERE v.data BETWEEN ${startDate} AND ${endDate} AND p.setor = ${sector}
        ORDER BY v.data DESC LIMIT 5000
      `;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Perdas
app.post('/api/perdas', async (req, res) => {
  try {
    const sql = getDB();
    const { startDate, endDate } = req.body;
    const result = await sql`
      SELECT per.*, p.nome as produto_nome, p.setor
      FROM perdas per
      LEFT JOIN produtos p ON per.produto_id = p.id
      WHERE per.data BETWEEN ${startDate} AND ${endDate}
      ORDER BY per.data DESC LIMIT 5000
    `;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Produtos
app.get('/api/produtos', async (req, res) => {
  try {
    const sql = getDB();
    const result = await sql`SELECT * FROM produtos ORDER BY nome`;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/produtos/catalogo', async (req, res) => {
  try {
    const sql = getDB();
    const result = await sql`SELECT * FROM produtos ORDER BY nome`;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/produtos/criar', async (req, res) => {
  try {
    const sql = getDB();
    const { nome, setor, preco } = req.body;
    const result = await sql`
      INSERT INTO produtos (nome, setor, preco) VALUES (${nome}, ${setor}, ${preco}) RETURNING *
    `;
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/produtos/atualizar', async (req, res) => {
  try {
    const sql = getDB();
    const { id, nome, setor, preco } = req.body;
    const result = await sql`
      UPDATE produtos SET nome=${nome}, setor=${setor}, preco=${preco} WHERE id=${id} RETURNING *
    `;
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/produtos/deletar', async (req, res) => {
  try {
    const sql = getDB();
    const { id } = req.body;
    await sql`DELETE FROM produtos WHERE id=${id}`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/produtos/precos', async (req, res) => {
  try {
    const sql = getDB();
    const { id, preco } = req.body;
    const result = await sql`UPDATE produtos SET preco=${preco} WHERE id=${id} RETURNING *`;
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Planejamento
app.get('/api/planejamento', async (req, res) => {
  try {
    const sql = getDB();
    const result = await sql`
      SELECT p.id, p.produto_id, p.data::text as data, p.quantidade_planejada, p.updated_at
      FROM planejamento p ORDER BY p.data DESC LIMIT 100
    `;
    res.json({ planejamentos: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/planejamento/dados', async (req, res) => {
  try {
    const sql = getDB();
    const { startDate, endDate } = req.body;
    const result = await sql`
      SELECT p.id, p.produto_id, p.data::text as data, p.quantidade_planejada, p.updated_at
      FROM planejamento p
      WHERE p.data BETWEEN ${startDate} AND ${endDate}
      ORDER BY p.data
    `;
    res.json({ planejamentos: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/planejamento/salvar', async (req, res) => {
  try {
    const sql = getDB();
    const { produto_id, data, quantidade_planejada } = req.body;
    const result = await sql`
      INSERT INTO planejamento (produto_id, data, quantidade_planejada, updated_at)
      VALUES (${produto_id}, ${data}, ${quantidade_planejada}, NOW())
      ON CONFLICT (produto_id, data)
      DO UPDATE SET quantidade_planejada = ${quantidade_planejada}, updated_at = NOW()
      RETURNING *
    `;
    res.json({ success: true, data: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/planejamento/debug', async (req, res) => {
  try {
    const sql = getDB();
    const result = await sql`SELECT COUNT(*) as total FROM planejamento`;
    res.json({ total: result[0].total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Config
app.get('/api/config', async (req, res) => {
  try {
    const sql = getDB();
    const result = await sql`SELECT * FROM configuracoes LIMIT 1`;
    res.json(result[0] || {});
  } catch (err) {
    res.json({});
  }
});

app.post('/api/config/salvar', async (req, res) => {
  try {
    const sql = getDB();
    const dados = req.body;
    await sql`
      INSERT INTO configuracoes (dados, atualizado_em) VALUES (${JSON.stringify(dados)}, NOW())
      ON CONFLICT (id) DO UPDATE SET dados = ${JSON.stringify(dados)}, atualizado_em = NOW()
    `;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
