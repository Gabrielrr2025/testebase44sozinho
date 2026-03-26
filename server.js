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

const SETORES_EXCLUIDOS = ['MINIMERCADO', 'SUPRIMENTOS', 'INATIVOS', 'KITS', 'ESPACO MAGICO'];

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/diagnostico', async (req, res) => {
  try {
    const sql = getDB();
    const vendas = await sql`SELECT COUNT(*) as total FROM vendas`;
    const produtos = await sql`SELECT COUNT(*) as total FROM produtos_plataforma`;
    res.json({ vendas: vendas[0], produtos: produtos[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/produtos', async (req, res) => {
  try {
    const sql = getDB();
    const result = await sql`
      SELECT 
        id, codigo as code, nome as name, setor as sector,
        unidade as unit, rendimento as recipe_yield,
        dias_producao as production_days,
        horario_producao, horario_venda, ativo as active,
        produto_lince_codigo
      FROM produtos_plataforma 
      ORDER BY nome
    `;
    res.json({ products: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/produtos/criar', async (req, res) => {
  try {
    const sql = getDB();
    const { code, name, sector, unit, recipe_yield, production_days,
            horario_producao, horario_venda, produto_lince_codigo } = req.body;
    const result = await sql`
      INSERT INTO produtos_plataforma 
        (codigo, nome, setor, unidade, rendimento, dias_producao, 
         horario_producao, horario_venda, produto_lince_codigo)
      VALUES 
        (${code}, ${name}, ${sector}, ${unit || 'UN'}, ${recipe_yield || 1}, 
         ${production_days || []}, ${horario_producao}, ${horario_venda}, 
         ${produto_lince_codigo})
      RETURNING *
    `;
    res.json({ success: true, product: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/produtos/atualizar', async (req, res) => {
  try {
    const sql = getDB();
    const { id, code, name, sector, unit, recipe_yield, production_days,
            horario_producao, horario_venda, active } = req.body;
    const result = await sql`
      UPDATE produtos_plataforma SET 
        codigo=${code}, nome=${name}, setor=${sector}, unidade=${unit},
        rendimento=${recipe_yield || 1}, dias_producao=${production_days || []},
        horario_producao=${horario_producao}, horario_venda=${horario_venda},
        ativo=${active !== false}, atualizado_em=NOW()
      WHERE id=${id} RETURNING *
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
    await sql`DELETE FROM produtos_plataforma WHERE id=${id}`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/produtos/lince-nao-cadastrados', async (req, res) => {
  try {
    const sql = getDB();
    const { sector } = req.query;

    let vendas;
    if (sector && sector !== 'all') {
      vendas = await sql`
        SELECT 
          v.produto_codigo::text as product_code,
          v.produto_descricao as product_name,
          v.departamento_descricao as sector,
          SUM(v.quantidade) as qty_vendas
        FROM vendas v
        WHERE v.departamento_descricao = ${sector}
          AND NOT EXISTS (
            SELECT 1 FROM produtos_plataforma pp 
            WHERE pp.produto_lince_codigo = v.produto_codigo::text
               OR pp.codigo = v.produto_codigo::text
          )
        GROUP BY v.produto_codigo, v.produto_descricao, v.departamento_descricao
        ORDER BY v.produto_descricao
      `;
    } else {
      vendas = await sql`
        SELECT 
          v.produto_codigo::text as product_code,
          v.produto_descricao as product_name,
          v.departamento_descricao as sector,
          SUM(v.quantidade) as qty_vendas
        FROM vendas v
        WHERE v.departamento_descricao NOT IN (
          'MINIMERCADO', 'SUPRIMENTOS', 'INATIVOS', 'KITS', 'ESPACO MAGICO'
        )
          AND NOT EXISTS (
            SELECT 1 FROM produtos_plataforma pp 
            WHERE pp.produto_lince_codigo = v.produto_codigo::text
               OR pp.codigo = v.produto_codigo::text
          )
        GROUP BY v.produto_codigo, v.produto_descricao, v.departamento_descricao
        ORDER BY v.produto_descricao
      `;
    }

    const perdas = await sql`
      SELECT 
        p.produto_codigo::text as product_code,
        SUM(p.quantidade) as qty_perdas
      FROM perdas p
      GROUP BY p.produto_codigo
    `;

    const perdasMap = new Map(perdas.map(p => [p.product_code, parseFloat(p.qty_perdas || 0)]));

    const result = vendas.map(v => ({
      product_code: v.product_code,
      product_name: v.product_name,
      sector: v.sector,
      quantity: parseFloat(v.qty_vendas || 0),
      sales: parseFloat(v.qty_vendas || 0),
      losses: perdasMap.get(v.product_code) || 0
    }));

    res.json({ 
      sales: result,
      salesData: result,
      losses: [],
      lossData: []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/produtos/catalogo', async (req, res) => {
  try {
    const sql = getDB();
    const result = await sql`
      SELECT id, codigo as code, nome as name, setor as sector, unidade as unit
      FROM produtos_plataforma WHERE ativo = true ORDER BY nome
    `;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/produtos/precos', async (req, res) => {
  try {
    const sql = getDB();
    const { id } = req.body;
    const result = await sql`
      UPDATE produtos_plataforma SET atualizado_em=NOW() WHERE id=${id} RETURNING *
    `;
    res.json(result[0]);
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
    res.json({ sales: result, salesData: result });
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
      ORDER BY data DESC LIMIT 5000
    `;
    res.json({ losses: result, lossData: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
      por_dia: porDia, por_produto: porProduto,
      total_geral: totais[0].total_geral,
      total_registros: totais[0].total_registros,
      ticket_medio: totais[0].ticket_medio
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/relatorio/dados', async (req, res) => {
  try {
    const sql = getDB();
    const { startDate, endDate } = req.body;
    const vendas = await sql`
      SELECT data::text, produto_codigo, produto_descricao, departamento_descricao as setor,
             SUM(valor_total) as total, SUM(quantidade) as qtd
      FROM vendas WHERE data BETWEEN ${startDate} AND ${endDate}
      GROUP BY data, produto_codigo, produto_descricao, departamento_descricao
      ORDER BY data DESC LIMIT 2000
    `;
    res.json({ vendas, sales: vendas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/relatorio/evolucao', async (req, res) => {
  try {
    const sql = getDB();
    const { productId, startDate, endDate } = req.body;
    const result = await sql`
      SELECT data::text, SUM(valor_total) as total, SUM(quantidade) as qtd
      FROM vendas 
      WHERE produto_codigo = ${productId}
        AND data BETWEEN ${startDate} AND ${endDate}
      GROUP BY data ORDER BY data
    `;
    res.json({ evolucao: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/relatorio/movimento', async (req, res) => {
  try {
    const sql = getDB();
    const { startDate, endDate } = req.body;
    const result = await sql`
      SELECT produto_codigo, produto_descricao, departamento_descricao as setor,
             SUM(valor_total) as total_vendas, SUM(quantidade) as total_qtd
      FROM vendas WHERE data BETWEEN ${startDate} AND ${endDate}
      GROUP BY produto_codigo, produto_descricao, departamento_descricao
      ORDER BY total_vendas DESC
    `;
    res.json({ movimento: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/relatorio/comparacao', async (req, res) => {
  res.json({ comparacao: [] });
});

app.post('/api/relatorio/multiperiodo', async (req, res) => {
  res.json({ periodos: [] });
});

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

app.post('/api/planejamento/dados', async (req, res) => {
  try {
    const sql = getDB();
    const { startDate, endDate } = req.body;

    const produtos = await sql`
      SELECT 
        pp.id::text as produto_id,
        pp.nome as produto_nome,
        pp.setor,
        pp.unidade,
        pp.dias_producao as production_days,
        pp.rendimento,
        COALESCE(
          (SELECT SUM(v.quantidade) FROM vendas v 
           WHERE v.produto_codigo::text = pp.produto_lince_codigo
             AND v.data BETWEEN ${startDate}::date - INTERVAL '28 days' AND ${startDate}::date
          ) / 4.0, 0
        ) as avg_sales,
        COALESCE(
          (SELECT SUM(v.quantidade) FROM vendas v 
           WHERE v.produto_codigo::text = pp.produto_lince_codigo
             AND v.data BETWEEN ${startDate}::date - INTERVAL '7 days' AND ${startDate}::date
          ), 0
        ) as current_sales,
        COALESCE(
          (SELECT SUM(p.quantidade) FROM perdas p
           WHERE p.produto_codigo::text = pp.produto_lince_codigo
             AND p.data BETWEEN ${startDate}::date - INTERVAL '7 days' AND ${startDate}::date
          ), 0
        ) as current_losses,
        COALESCE(
          (SELECT SUM(p.quantidade) FROM perdas p
           WHERE p.produto_codigo::text = pp.produto_lince_codigo
             AND p.data BETWEEN ${startDate}::date - INTERVAL '28 days' AND ${startDate}::date
          ) / 4.0, 0
        ) as avg_losses,
        0 as avg_loss_rate,
        0 as current_loss_rate,
        'stable' as sales_trend,
        'stable' as losses_trend,
        1 as multiplicador_calendario,
        'Baseado na média das últimas 4 semanas' as suggestion,
        'media' as confianca
      FROM produtos_plataforma pp
      WHERE pp.ativo = true
      ORDER BY pp.nome
    `;

    const produtosComSugestao = produtos.map(p => ({
      ...p,
      avg_sales: parseFloat(p.avg_sales || 0).toFixed(1),
      avg_losses: parseFloat(p.avg_losses || 0).toFixed(1),
      suggested_production: Math.ceil(parseFloat(p.avg_sales || 0) * 1.1)
    }));

    const planejamentos = await sql`
      SELECT produto_id::text, data::text, quantidade_planejada
      FROM planejamento
      WHERE data BETWEEN ${startDate} AND ${endDate}
    `;

    res.json({ products: produtosComSugestao, planejamentos });
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

app.get('/api/semana/atual', (req, res) => {
  res.json({ data: new Date().toISOString().split('T')[0] });
});

app.get('/api/config', async (req, res) => {
  try {
    const sql = getDB();
    const result = await sql`SELECT * FROM configuracoes LIMIT 1`;
    res.json(result[0] || { valor: '1234' });
  } catch (err) {
    res.json({ valor: '1234' });
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
