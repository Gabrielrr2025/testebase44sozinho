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
      WITH ref AS (
        SELECT
          -- Semana passada completa: terça a segunda
          (DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '6 days')::date AS sem_inicio,
          (DATE_TRUNC('week', CURRENT_DATE))::date                      AS sem_fim,
          -- Últimas 4 semanas: 4 terças atrás até segunda passada
          (DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '34 days')::date AS avg_inicio,
          (DATE_TRUNC('week', CURRENT_DATE))::date                      AS avg_fim
      )
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
             AND v.data BETWEEN (SELECT avg_inicio FROM ref) AND (SELECT avg_fim FROM ref)
          ) / 4.0, 0
        ) as avg_sales,
        COALESCE(
          (SELECT SUM(v.quantidade) FROM vendas v 
           WHERE v.produto_codigo::text = pp.produto_lince_codigo
             AND v.data BETWEEN (SELECT sem_inicio FROM ref) AND (SELECT sem_fim FROM ref)
          ), 0
        ) as current_sales,
        COALESCE(
          (SELECT SUM(p.quantidade) FROM perdas p
           WHERE p.produto_codigo::text = pp.produto_lince_codigo
             AND p.data BETWEEN (SELECT sem_inicio FROM ref) AND (SELECT sem_fim FROM ref)
          ), 0
        ) as current_losses,
        COALESCE(
          (SELECT SUM(p.quantidade) FROM perdas p
           WHERE p.produto_codigo::text = pp.produto_lince_codigo
             AND p.data BETWEEN (SELECT avg_inicio FROM ref) AND (SELECT avg_fim FROM ref)
          ) / 4.0, 0
        ) as avg_losses,
        0 as avg_loss_rate,
        0 as current_loss_rate,
        'stable' as sales_trend,
        'stable' as losses_trend,
        1 as multiplicador_calendario,
        'Baseado na média das últimas 4 semanas (ter-seg)' as suggestion,
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
    const { chave } = req.query;
    if (chave) {
      const result = await sql`SELECT * FROM configuracoes WHERE chave = ${chave} LIMIT 1`;
      res.json(result[0] || { chave, valor: '1234' });
    } else {
      const result = await sql`SELECT * FROM configuracoes`;
      res.json(result);
    }
  } catch (err) {
    res.json({ valor: '1234' });
  }
});

app.post('/api/config/salvar', async (req, res) => {
  try {
    const sql = getDB();
    const { chave, valor } = req.body;
    await sql`
      INSERT INTO configuracoes (chave, valor, updated_at) VALUES (${chave}, ${valor}, NOW())
      ON CONFLICT (chave) DO UPDATE SET valor = ${valor}, updated_at = NOW()
    `;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PEDIDOS DE PRODUÇÃO ─────────────────────────────────────────────────────

// Listar histórico de pedidos
app.get('/api/pedidos', async (req, res) => {
  try {
    const sql = getDB();
    const result = await sql`
      SELECT 
        id, numero, semana_inicio::text, semana_fim::text,
        emitido_em, status
      FROM pedidos_producao
      ORDER BY emitido_em DESC
    `;
    res.json({ pedidos: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Buscar um pedido específico com suas quantidades
app.get('/api/pedidos/:id', async (req, res) => {
  try {
    const sql = getDB();
    const { id } = req.params;
    const pedido = await sql`
      SELECT id, numero, semana_inicio::text, semana_fim::text, emitido_em, status
      FROM pedidos_producao WHERE id = ${id}
    `;
    if (!pedido.length) return res.status(404).json({ error: 'Pedido não encontrado' });

    // Buscar do snapshot (pedido_itens)
    const itens = await sql`
      SELECT produto_id, produto_nome, setor, unidade, data::text, quantidade, dia_semana
      FROM pedido_itens
      WHERE pedido_id = ${id}
      ORDER BY produto_nome, data
    `;
    res.json({ pedido: pedido[0], itens });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Emitir pedido de produção
app.post('/api/pedidos/emitir', async (req, res) => {
  try {
    const sql = getDB();
    const { semana_inicio, semana_fim } = req.body;

    // Gerar número único PP-YYYY-NNN
    const ano = new Date().getFullYear();
    const countResult = await sql`
      SELECT COUNT(*) as total FROM pedidos_producao 
      WHERE EXTRACT(YEAR FROM emitido_em) = ${ano}
    `;
    const seq = (parseInt(countResult[0].total) + 1).toString().padStart(3, '0');
    const numero = `PP-${ano}-${seq}`;

    // Criar pedido
    const pedido = await sql`
      INSERT INTO pedidos_producao (numero, semana_inicio, semana_fim, status)
      VALUES (${numero}, ${semana_inicio}, ${semana_fim}, 'emitido')
      RETURNING id, numero
    `;

    const pedidoId = pedido[0].id;

    // Buscar quantidades atuais da semana (sem filtro de pedido_id)
    const itensAtuais = await sql`
      SELECT 
        pl.produto_id::text, pl.data::text, pl.quantidade_planejada,
        pp.nome as produto_nome, pp.setor, pp.unidade,
        TO_CHAR(pl.data, 'Day') as dia_semana
      FROM planejamento pl
      JOIN produtos_plataforma pp ON pp.id = pl.produto_id::integer
      WHERE pl.data BETWEEN ${semana_inicio} AND ${semana_fim}
        AND pl.quantidade_planejada > 0
      ORDER BY pp.nome, pl.data
    `;

    // Salvar snapshot no momento da emissão
    for (const item of itensAtuais) {
      await sql`
        INSERT INTO pedido_itens (pedido_id, produto_id, produto_nome, setor, unidade, data, quantidade, dia_semana)
        VALUES (${pedidoId}, ${item.produto_id}, ${item.produto_nome}, ${item.setor}, ${item.unidade}, ${item.data}, ${item.quantidade_planejada}, ${item.dia_semana})
      `;
    }

    // Vincular planejamentos ao pedido
    await sql`
      UPDATE planejamento 
      SET pedido_id = ${pedidoId}
      WHERE data BETWEEN ${semana_inicio} AND ${semana_fim}
    `;

    res.json({ success: true, pedido: pedido[0], itens: itensAtuais });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verificar se semana já tem pedido emitido
app.get('/api/pedidos/semana/:inicio/:fim', async (req, res) => {
  try {
    const sql = getDB();
    const { inicio, fim } = req.params;
    const result = await sql`
      SELECT id, numero, emitido_em, status
      FROM pedidos_producao
      WHERE semana_inicio = ${inicio} AND semana_fim = ${fim}
      LIMIT 1
    `;
    res.json({ pedido: result[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
