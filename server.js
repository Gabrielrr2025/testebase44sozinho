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

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/diagnostico', async (req, res) => {
  try {
    const sql = getDB();
    const vendas = await sql`SELECT COUNT(*) as total FROM vendas`;
    const produtos = await sql`SELECT COUNT(*) as total FROM produtos`;
    res.json({ vendas: vendas[0], produtos: produtos[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Produtos — traduz colunas do banco para o formato do frontend
app.get('/api/produtos', async (req, res) => {
  try {
    const sql = getDB();
    const result = await sql`
      SELECT 
        codigo as id,
        codigo as code,
        descricao as name,
        departamento_desc as sector,
        unidade as unit,
        preco_custo as cost_price,
        true as active
      FROM produtos 
      ORDER BY descricao
    `;
    res.json({ products: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/produtos/catalogo', async (req, res) => {
  try {
    const sql = getDB();
    const result = await sql`
      SELECT codigo as id, codigo as code, descricao as name, 
             departamento_desc as sector, unidade as unit
      FROM produtos ORDER BY descricao
    `;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/produtos/criar', async (req, res) => {
  try {
    const sql = getDB();
    const { code, name, sector, unit } = req.body;
    const result = await sql`
      INSERT INTO produtos (codigo, descricao, departamento_desc, unidade)
      VALUES (${code}, ${name}, ${sector}, ${unit}) RETURNING *
    `;
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/produtos/atualizar', async (req, res) => {
  try {
    const sql = getDB();
    const { id, code, name, sector, unit } = req.body;
    const result = await sql`
      UPDATE produtos SET descricao=${name}, departamento_desc=${sector}, unidade=${unit}
      WHERE codigo=${id} RETURNING *
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
    await sql`DELETE FROM produtos WHERE codigo=${id}`;
    res.json({ success: true });
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
        SELECT data, valor_total, produto_codigo, produto_descricao,
               departamento_descricao as setor, quantidade
        FROM vendas
        WHERE data BETWEEN ${startDate} AND ${endDate}
        ORDER BY data DESC LIMIT 5000
      `;
    } else {
      result = await sql`
        SELECT data, valor_total, produto_codigo, produto_descricao,
               departamento_descricao as setor, quantidade
        FROM vendas
        WHERE data BETWEEN ${startDate} AND ${endDate}
          AND departamento_descricao = ${sector}
        ORDER BY data DESC LIMIT 5000
      `;
    }
    res.json({ sales: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Relatório de vendas
app.post('/api/relatorio/vendas', async (req, res) => {
  try {
    const sql = getDB();
    const { startDate, endDate } = req.body;
    const porDia = await sql`
      SELECT data::text, SUM(valor_total) as total, COUNT(*) as registros
      FROM vendas WHERE data BETWEEN ${startDate} AND ${endDate}
      GROUP BY data ORDER BY data
    `;
    const porProduto = await sql`
      SELECT produto_descricao as produto_nome, departamento_descricao as setor,
             SUM(valor_total) as total, SUM(quantidade) as qtd
      FROM vendas WHERE data BETWEEN ${startDate} AND ${endDate}
      GROUP BY produto_codigo, produto_descricao, departamento_descricao
      ORDER BY total DESC LIMIT 20
    `;
    const totais = await sql`
      SELECT SUM(valor_total) as total_geral, COUNT(*) as total_registros,
             AVG(valor_total) as ticket_medio
      FROM vendas WHERE data BETWEEN ${startDate} AND ${endDate}
    `;
    res.json({ 
      por_dia: porDia, 
      por_produto: porProduto,
      total_geral: totais[0].total_geral,
      total_registros: totais[0].total_registros,
      ticket_medio: totais[0].ticket_medio
    });
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
      SELECT * FROM perdas
      WHERE data BETWEEN ${startDate} AND ${endDate}
      ORDER BY data DESC LIMIT 5000
    `;
    res.json({ losses: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard
app.post('/api/dashboard', async (req, res) => {
  try {
    const sql = getDB();
    const { startDate, endDate } = req.body;
    const vendas = await sql`
      SELECT EXTRACT(YEAR FROM data) as ano, SUM(valor_total) as total, COUNT(*) as registros
      FROM vendas WHERE data BETWEEN ${startDate} AND ${endDate}
      GROUP BY ano ORDER BY ano
    `;
    res.json({ vendas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Planejamento
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
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
