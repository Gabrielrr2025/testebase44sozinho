const API_URL = import.meta.env.VITE_API_URL || 'https://testebase44sozinho.onrender.com';

const post = async (endpoint, body = {}) => {
  const res = await fetch(`${API_URL}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
};

const get = async (endpoint) => {
  const res = await fetch(`${API_URL}/api/${endpoint}`);
  return res.json();
};

export const base44 = {
  auth: {
    me: async () => ({
      id: '1',
      email: 'admin@empresa.com',
      role: 'admin',
      permissions: {
        dashboard: true, products: true, planning: true,
        calendar: true, reports: true, settings: true, admin: true
      }
    }),
    logout: async () => {},
    login: async () => {}
  },
  functions: {
    invoke: async (name, params = {}) => {
      console.log(`Chamando função: ${name}`, params);
      switch (name) {
        case 'Getproducts':            return get('produtos');
        case 'fetchSQLData':           return get('produtos/lince-nao-cadastrados');
        case 'Getlossesreport':
        case 'getLossesReport':        return post('perdas', params);
        case 'getSalesReport':         return post('relatorio/vendas', params);
        case 'getReportData':          return post('relatorio/dados', params);
        case 'getReportData_MULTIPERIOD': return post('relatorio/multiperiodo', params);
        case 'getDashboardData':       return post('dashboard', params);
        case 'getPlanning':
        case 'Getplanningdata':        return post('planejamento/dados', params);
        case 'savePlanning':           return post('planejamento/salvar', params);
        case 'getConfig':              return get('config');
        case 'saveConfig':             return post('config/salvar', params);
        case 'Createproduct':          return post('produtos/criar', params);
        case 'Updateproduct':          return post('produtos/atualizar', params);
        case 'Deleteproduct':          return post('produtos/deletar', params);
        case 'getCatalogWithPricing':  return get('produtos/catalogo');
        case 'updateProductPricing':   return post('produtos/precos', params);
        case 'Debugplanning':          return post('planejamento/debug', params);
        case 'diagnosticDB':           return get('diagnostico');
        case 'getProductEvolution':
        case 'Getproductevolution':    return post('relatorio/evolucao', params);
        case 'getProductMovementData': return post('relatorio/movimento', params);
        case 'Getproductcomparison':   return post('relatorio/comparacao', params);
        case 'getCurrentWeek':         return get('semana/atual');
        case 'inspectDB':
        case 'inspectVendas':
        case 'checkSchema':
        case 'initDB':
        case 'testConnection':         return get('diagnostico');
        default:
          console.warn(`Função não mapeada: ${name}`);
          return {};
      }
    }
  }
};


