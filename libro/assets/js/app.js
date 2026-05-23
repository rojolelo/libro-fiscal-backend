/**
 * ==========================================================================
 * LOGICA DE NEGOCIO: LIBRO FISCAL Y DECLARACIÓN FORMA 30 SENIAT (VENEZUELA)
 * ==========================================================================
 */

// Estado Inicial y Estructura de Datos para Venezuela (v4)
let state = {
    activeBeneficiaryId: null,
    beneficiarios: [],
    compras: [],
    ventas: [],
    contactos: [],
    config: {
        ivaRate: 16, // Alícuota general estándar actual
        theme: 'dark',
        empresaName: 'Mi Empresa C.A.',
        empresaRut: 'J-12345678-9',
        empresaContribuyente: 'especial', // 'especial' o 'ordinario'
        retencionesAnteriores: 0 // Retenciones acumuladas de periodos anteriores
    }
};

// Clave única para persistencia
const STORAGE_KEY = 'libro_compras_ventas_data_v4';

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', async () => {
    await inicializarDatos();
    configurarEventos();
    renderAll();
});

// --- PERSISTENCIA Y ESTADO ---

function getActiveBeneficiary() {
    if (!state.beneficiarios) state.beneficiarios = [];
    return state.beneficiarios.find(b => b.id === state.activeBeneficiaryId) || state.beneficiarios[0];
}

function syncBeneficiarioActivo() {
    if (!state.beneficiarios) state.beneficiarios = [];
    if (state.activeBeneficiaryId === null && state.beneficiarios.length > 0) {
        state.activeBeneficiaryId = state.beneficiarios[0].id;
    }
    const active = state.beneficiarios.find(b => b.id === state.activeBeneficiaryId);
    if (active) {
        active.compras = state.compras || [];
        active.ventas = state.ventas || [];
        active.contactos = state.contactos || [];
    }
}

function seleccionarBeneficiario(id) {
    // Sincronizar datos del beneficiario actual antes de cambiar
    syncBeneficiarioActivo();
    
    state.activeBeneficiaryId = id;
    const active = state.beneficiarios.find(b => b.id === id);
    if (active) {
        state.compras = active.compras || [];
        state.ventas = active.ventas || [];
        state.contactos = active.contactos || [];
        state.config.empresaName = active.name;
        state.config.empresaRut = active.tax_id;
        state.config.empresaContribuyente = active.especial === 'si' ? 'especial' : 'ordinario';
        state.config.retencionesAnteriores = active.retencionesAnteriores || 0;
    }
    guardarDatos();
    renderAll();
    
    // Forzar actualización de reportes si estamos en la vista de reportes
    const activeTab = document.querySelector('.nav-item.active');
    if (activeTab && activeTab.getAttribute('data-section') === 'reportes') {
        generarForma30SENIAT();
    }
}

async function inicializarDatos() {
    let cargadoSQLite = false;
    try {
        let data;
        if (window.electronAPI) {
            data = await window.electronAPI.loadData();
        } else {
            const res = await fetch('api.php?action=load');
            if (res.ok) {
                data = await res.json();
            }
        }

        if (data && data.beneficiarios) {
            state = data;
            
            // Si la base de datos de SQLite está completamente vacía (limpia), inicializar una por defecto
            if (state.beneficiarios.length === 0) {
                const defaultBeneficiary = {
                    id: Date.now(),
                    name: 'Nueva Empresa S.A.',
                    tax_id: 'J-00000000-0',
                    especial: 'no',
                    retencionesAnteriores: 0,
                    compras: [],
                    ventas: [],
                    contactos: []
                };
                state.beneficiarios = [defaultBeneficiary];
                state.activeBeneficiaryId = defaultBeneficiary.id;
            }
            
            // Asegurar integridad de nodos de configuración global
            if (!state.config) {
                state.config = {
                    ivaRate: 16,
                    theme: 'dark'
                };
            }
            if (!state.config.ivaRate) state.config.ivaRate = 16;
            if (!state.config.theme) state.config.theme = 'dark';
            
            // Asegurar que activeBeneficiaryId sea válido
            if (!state.activeBeneficiaryId || !state.beneficiarios.find(b => b.id === state.activeBeneficiaryId)) {
                state.activeBeneficiaryId = state.beneficiarios[0].id;
            }
            
            // Montar los datos del beneficiario activo
            const active = state.beneficiarios.find(b => b.id === state.activeBeneficiaryId);
            state.compras = active.compras || [];
            state.ventas = active.ventas || [];
            state.contactos = active.contactos || [];
            state.config.empresaName = active.name;
            state.config.empresaRut = active.tax_id;
            state.config.empresaContribuyente = active.especial === 'si' ? 'especial' : 'ordinario';
            state.config.retencionesAnteriores = active.retencionesAnteriores || 0;
            
            // Sincronizar respaldo en localStorage
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            cargadoSQLite = true;
            actualizarIndicadorBaseDatos(true, window.electronAPI ? 'Electron (SQLite)' : 'SQLite Local');
            mostrarNotificacion(window.electronAPI ? 'Datos cargados vía Electron SQLite.' : 'Datos cargados de base de datos SQLite.', 'success');
        }
    } catch (e) {
        console.warn('Backend SQLite no disponible. Cargando desde almacenamiento local del navegador.', e);
    }

    if (!cargadoSQLite) {
        inicializarDatosDesdeLocalStorage();
    }

    // Aplicar Tema
    document.documentElement.setAttribute('data-theme', state.config.theme || 'dark');
}

function inicializarDatosDesdeLocalStorage() {
    const localData = localStorage.getItem(STORAGE_KEY);
    if (localData) {
        try {
            state = JSON.parse(localData);
            
            // Migración desde formato de base de datos antiguo (sin beneficiarios)
            if (!state.beneficiarios) {
                const oldBeneficiary = {
                    id: Date.now(),
                    name: (state.config && state.config.empresaName) || 'Mi Empresa C.A.',
                    tax_id: (state.config && state.config.empresaRut) || 'J-12345678-9',
                    especial: (state.config && state.config.empresaContribuyente === 'especial') ? 'si' : 'no',
                    retencionesAnteriores: (state.config && state.config.retencionesAnteriores) || 0,
                    compras: state.compras || [],
                    ventas: state.ventas || [],
                    contactos: state.contactos || []
                };
                state.beneficiarios = [oldBeneficiary];
                state.activeBeneficiaryId = oldBeneficiary.id;
                
                // Limpiar variables del raíz
                delete state.compras;
                delete state.ventas;
                delete state.contactos;
            }
            
            // Asegurar integridad de nodos de configuración global
            if (!state.config) {
                state.config = {
                    ivaRate: 16,
                    theme: 'dark'
                };
            }
            if (!state.config.ivaRate) state.config.ivaRate = 16;
            if (!state.config.theme) state.config.theme = 'dark';
            
            if (state.beneficiarios.length === 0) {
                cargarDatosDemoVenezuela();
            } else {
                // Asegurar que activeBeneficiaryId sea válido
                if (!state.activeBeneficiaryId || !state.beneficiarios.find(b => b.id === state.activeBeneficiaryId)) {
                    state.activeBeneficiaryId = state.beneficiarios[0].id;
                }
                
                // Montar los datos del beneficiario activo
                const active = state.beneficiarios.find(b => b.id === state.activeBeneficiaryId);
                state.compras = active.compras || [];
                state.ventas = active.ventas || [];
                state.contactos = active.contactos || [];
                state.config.empresaName = active.name;
                state.config.empresaRut = active.tax_id;
                state.config.empresaContribuyente = active.especial === 'si' ? 'especial' : 'ordinario';
                state.config.retencionesAnteriores = active.retencionesAnteriores || 0;
            }
            actualizarIndicadorBaseDatos(false);
            mostrarNotificacion('Datos cargados de almacenamiento LocalStorage.', 'info');
        } catch (e) {
            console.error('Error parseando datos fiscales locales, cargando vacíos', e);
            cargarEstadoVacio();
        }
    } else {
        cargarDatosDemoVenezuela();
        mostrarNotificacion('Datos de prueba venezolanos cargados.', 'success');
    }
}

async function guardarDatos() {
    syncBeneficiarioActivo();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    actualizarIndicadorBaseDatos(false);
    
    // Guardar en la base de datos SQLite
    try {
        if (window.electronAPI) {
            const res = await window.electronAPI.saveData(state);
            if (res && res.success) {
                actualizarIndicadorBaseDatos(true, 'Electron (SQLite)');
            }
        } else {
            const response = await fetch('api.php?action=save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(state)
            });
            if (response.ok) {
                const res = await response.json();
                if (res.success) {
                    actualizarIndicadorBaseDatos(true, 'SQLite Local');
                }
            }
        }
    } catch (e) {
        console.warn('No se pudo guardar en la base de datos SQLite. Se mantiene guardado local en el navegador.', e);
    }
}

function cargarEstadoVacio() {
    const defaultBeneficiary = {
        id: Date.now(),
        name: 'Nueva Empresa S.A.',
        tax_id: 'J-00000000-0',
        especial: 'no',
        retencionesAnteriores: 0,
        compras: [],
        ventas: [],
        contactos: []
    };
    
    state = {
        activeBeneficiaryId: defaultBeneficiary.id,
        beneficiarios: [defaultBeneficiary],
        config: {
            ivaRate: 16,
            theme: 'dark'
        }
    };
    
    // Montar variables de estado activo
    state.compras = defaultBeneficiary.compras;
    state.ventas = defaultBeneficiary.ventas;
    state.contactos = defaultBeneficiary.contactos;
    state.config.empresaName = defaultBeneficiary.name;
    state.config.empresaRut = defaultBeneficiary.tax_id;
    state.config.empresaContribuyente = defaultBeneficiary.especial === 'si' ? 'especial' : 'ordinario';
    state.config.retencionesAnteriores = defaultBeneficiary.retencionesAnteriores;
    
    guardarDatos();
}

function cargarDatosDemoVenezuela() {
    state.config = {
        ivaRate: 16,
        theme: 'dark',
        empresaName: 'Corporación Inversiones del Caribe C.A.',
        empresaRut: 'J-30567890-1',
        empresaContribuyente: 'especial',
        retencionesAnteriores: 2450.50
    };

    // Proveedores y Clientes con R.I.F. venezolano
    state.contactos = [
        { id: 1, tax_id: 'J-00123456-7', name: 'Compañía Anónima Nacional Teléfonos de Venezuela (CANTV)', type: 'proveedor', especial: 'si', email: 'facturacion@cantv.com.ve', phone: '0212-5001111', address: 'Av. Libertador, Edif. Administrativo CANTV, Caracas' },
        { id: 2, tax_id: 'J-31405020-0', name: 'Distribuidora Mayorista Alimentos de Oriente C.A.', type: 'proveedor', especial: 'no', email: 'ventas@alioriente.com', phone: '0281-2824050', address: 'Zona Industrial Los Montones, Barcelona' },
        { id: 3, tax_id: 'J-40987654-3', name: 'Corporación Siderúrgica Alfa C.A. (Cliente Especial)', type: 'cliente', especial: 'si', email: 'adquisiciones@corp-alfa.com.ve', phone: '0286-9614030', address: 'Av. Norte-Sur 3, Zona Industrial Matanzas, Puerto Ordaz' },
        { id: 4, tax_id: 'V-15678901-2', name: 'Pedro José Rodríguez (Cliente General)', type: 'cliente', especial: 'no', email: 'pedro.rodriguez@gmail.com', phone: '0414-8023145', address: 'Urb. Lechería, Av. Principal, Casa N° 12, Lechería' },
        { id: 5, tax_id: 'J-30456789-0', name: 'Importaciones y Tecnología del Norte C.A.', type: 'proveedor', especial: 'no', email: 'ventas@importnorte.com', phone: '0241-8321040', address: 'C.C. Free Market, Local 45, Valencia' },
        { id: 6, tax_id: 'J-32104050-6', name: 'Comercializadora Agropecuaria Los Llanos C.A.', type: 'cliente', especial: 'si', email: 'finanzas@agro-llanos.com', phone: '0246-4312233', address: 'Calle Páez, Local 4, San Juan de los Morros' }
    ];

    const hoy = new Date();
    const mesActual = hoy.toISOString().substring(0, 7); // YYYY-MM
    const mesAnteriorDate = new Date();
    mesAnteriorDate.setMonth(hoy.getMonth() - 1);
    const mesAnterior = mesAnteriorDate.toISOString().substring(0, 7);

    // Registro de compras con alícuotas y retenciones
    state.compras = [
        {
            id: 1, type: 'compra', date: `${mesAnterior}-05`, doc_type: 'Factura', doc_number: '10984', control_number: '00-023456', contact_id: 1,
            is_import_export: false,
            base_exenta: 0, base_general: 12000, tax_general: 1920, base_reducida: 0, tax_reducida: 0, base_adicional: 0, tax_adicional: 0,
            net_amount: 12000, tax_amount: 1920, total_amount: 13920,
            has_retention: true, retention_pct: 75, retention_amount: 1440, retention_number: '2026040001', retention_date: `${mesAnterior}-05`,
            status: 'Pagado', notes: 'Servicio de telefonía e internet'
        },
        {
            id: 2, type: 'compra', date: `${mesAnterior}-18`, doc_type: 'Factura', doc_number: '8902', control_number: '00-410293', contact_id: 2,
            is_import_export: false,
            base_exenta: 3500, base_general: 25000, tax_general: 4000, base_reducida: 5000, tax_reducida: 400, base_adicional: 0, tax_adicional: 0,
            net_amount: 30000, tax_amount: 4400, total_amount: 37900,
            has_retention: true, retention_pct: 75, retention_amount: 3300, retention_number: '2026040002', retention_date: `${mesAnterior}-18`,
            status: 'Pagado', notes: 'Compra de productos de consumo masivo'
        },
        {
            id: 3, type: 'compra', date: `${mesActual}-03`, doc_type: 'Factura', doc_number: '4390', control_number: '00-019483', contact_id: 5,
            is_import_export: true, // Importación
            base_exenta: 0, base_general: 45000, tax_general: 7200, base_reducida: 0, tax_reducida: 0, base_adicional: 10000, tax_adicional: 3100,
            net_amount: 55000, tax_amount: 10300, total_amount: 65300,
            has_retention: false, retention_pct: 75, retention_amount: 0, retention_number: '', retention_date: '',
            status: 'Pagado', notes: 'Importación de equipos de computación y lujo'
        },
        {
            id: 4, type: 'compra', date: `${mesActual}-10`, doc_type: 'Factura', doc_number: '11005', control_number: '00-023477', contact_id: 1,
            is_import_export: false,
            base_exenta: 0, base_general: 15000, tax_general: 2400, base_reducida: 0, tax_reducida: 0, base_adicional: 0, tax_adicional: 0,
            net_amount: 15000, tax_amount: 2400, total_amount: 17400,
            has_retention: true, retention_pct: 75, retention_amount: 1800, retention_number: '2026050001', retention_date: `${mesActual}-10`,
            status: 'Pagado', notes: 'Servicio de internet mes actual'
        },
        {
            id: 5, type: 'compra', date: `${mesActual}-18`, doc_type: 'Factura', doc_number: '9211', control_number: '00-410889', contact_id: 2,
            is_import_export: false,
            base_exenta: 2000, base_general: 18000, tax_general: 2880, base_reducida: 4000, tax_reducida: 320, base_adicional: 0, tax_adicional: 0,
            net_amount: 22000, tax_amount: 3200, total_amount: 27200,
            has_retention: true, retention_pct: 75, retention_amount: 2400, retention_number: '2026050002', retention_date: `${mesActual}-18`,
            status: 'Pendiente', notes: 'Compra de provisiones mayoristas'
        }
    ];

    // Registro de ventas con alícuotas y retenciones recibidas de clientes contribuyentes especiales
    state.ventas = [
        {
            id: 1, type: 'venta', date: `${mesAnterior}-08`, doc_type: 'Factura', doc_number: '00201', control_number: '00-000101', contact_id: 3,
            is_import_export: false,
            base_exenta: 0, base_general: 80000, tax_general: 12800, base_reducida: 0, tax_reducida: 0, base_adicional: 0, tax_adicional: 0,
            net_amount: 80000, tax_amount: 12800, total_amount: 92800,
            has_retention: true, retention_pct: 75, retention_amount: 9600, retention_number: 'RET-2026-0043', retention_date: `${mesAnterior}-10`,
            status: 'Pagado', notes: 'Distribución de repuestos metalúrgicos'
        },
        {
            id: 2, type: 'venta', date: `${mesAnterior}-22`, doc_type: 'Factura', doc_number: '00202', control_number: '00-000102', contact_id: 4,
            is_import_export: false,
            base_exenta: 1000, base_general: 15000, tax_general: 2400, base_reducida: 0, tax_reducida: 0, base_adicional: 0, tax_adicional: 0,
            net_amount: 15000, tax_amount: 2400, total_amount: 18400,
            has_retention: false, retention_pct: 75, retention_amount: 0, retention_number: '', retention_date: '',
            status: 'Pagado', notes: 'Venta a persona natural'
        },
        {
            id: 3, type: 'venta', date: `${mesActual}-04`, doc_type: 'Factura', doc_number: '00203', control_number: '00-000103', contact_id: 3,
            is_import_export: false,
            base_exenta: 0, base_general: 95000, tax_general: 15200, base_reducida: 0, tax_reducida: 0, base_adicional: 0, tax_adicional: 0,
            net_amount: 95000, tax_amount: 15200, total_amount: 110200,
            has_retention: true, retention_pct: 75, retention_amount: 11400, retention_number: 'RET-2026-0089', retention_date: `${mesActual}-06`,
            status: 'Pagado', notes: 'Entrega de material de construcción estructural'
        },
        {
            id: 4, type: 'venta', date: `${mesActual}-12`, doc_type: 'Factura', doc_number: '00204', control_number: '00-000104', contact_id: 6,
            is_import_export: false,
            base_exenta: 5000, base_general: 60000, tax_general: 9600, base_reducida: 12000, tax_reducida: 960, base_adicional: 0, tax_adicional: 0,
            net_amount: 72000, tax_amount: 10560, total_amount: 87560,
            has_retention: true, retention_pct: 75, retention_amount: 7920, retention_number: 'RET-AGRO-8820', retention_date: `${mesActual}-14`,
            status: 'Pagado', notes: 'Despacho agroindustrial'
        },
        {
            id: 5, type: 'venta', date: `${mesActual}-19`, doc_type: 'Factura', doc_number: '00205', control_number: '00-000105', contact_id: 4,
            is_import_export: false,
            base_exenta: 0, base_general: 18000, tax_general: 2880, base_reducida: 0, tax_reducida: 0, base_adicional: 0, tax_adicional: 0,
            net_amount: 18000, tax_amount: 2880, total_amount: 20880,
            has_retention: false, retention_pct: 75, retention_amount: 0, retention_number: '', retention_date: '',
            status: 'Pagado', notes: 'Venta de insumos menores'
        }
    ];

    // Estructurar en state.beneficiarios
    const demoBeneficiary = {
        id: 1,
        name: state.config.empresaName,
        tax_id: state.config.empresaRut,
        especial: state.config.empresaContribuyente === 'especial' ? 'si' : 'no',
        retencionesAnteriores: state.config.retencionesAnteriores,
        compras: state.compras || [],
        ventas: state.ventas || [],
        contactos: state.contactos || []
    };
    
    state.beneficiarios = [demoBeneficiary];
    state.activeBeneficiaryId = demoBeneficiary.id;
    
    // Limpiar variables a nivel de raíz
    state.config = {
        ivaRate: 16,
        theme: state.config.theme || 'dark'
    };
    
    // Volver a montar
    state.compras = demoBeneficiary.compras;
    state.ventas = demoBeneficiary.ventas;
    state.contactos = demoBeneficiary.contactos;
    state.config.empresaName = demoBeneficiary.name;
    state.config.empresaRut = demoBeneficiary.tax_id;
    state.config.empresaContribuyente = demoBeneficiary.especial === 'si' ? 'especial' : 'ordinario';
    state.config.retencionesAnteriores = demoBeneficiary.retencionesAnteriores;

    guardarDatos();
}

// --- EVENTOS Y TRIGGERS CONTABLES ---

function configurarEventos() {
    // Formateadores automáticos de R.I.F. / Cédula Venezolana
    const inputContactoTax = document.getElementById('contacto-tax-id');
    const inputBeneficiarioTax = document.getElementById('beneficiario-tax-id');
    const selectContacto = document.getElementById('contacto-documento-tipo');
    const selectBeneficiario = document.getElementById('beneficiario-documento-tipo');

    if (inputContactoTax) {
        inputContactoTax.addEventListener('input', aplicarFormatoRif);
        inputContactoTax.addEventListener('blur', aplicarFormatoRif);
    }
    if (inputBeneficiarioTax) {
        inputBeneficiarioTax.addEventListener('input', aplicarFormatoRif);
        inputBeneficiarioTax.addEventListener('blur', aplicarFormatoRif);
    }
    if (selectContacto) {
        selectContacto.addEventListener('change', () => {
            const input = document.getElementById('contacto-tax-id');
            if (input) {
                input.value = formatearRif(input.value, selectContacto.value);
            }
        });
    }
    if (selectBeneficiario) {
        selectBeneficiario.addEventListener('change', () => {
            const input = document.getElementById('beneficiario-tax-id');
            if (input) {
                input.value = formatearRif(input.value, selectBeneficiario.value);
            }
        });
    }

    // Navegación Sidebar (SPA tabs)
    document.querySelectorAll('.nav-item button').forEach(button => {
        button.addEventListener('click', (e) => {
            const parent = button.parentElement;
            const targetSection = parent.getAttribute('data-section');
            
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            parent.classList.add('active');
            
            document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
            document.getElementById(`${targetSection}-section`).classList.add('active');
            
            document.querySelector('.sidebar').classList.remove('active');

            // Actualizar títulos en el encabezado
            const headerTitle = document.getElementById('header-section-title');
            const headerSubtitle = document.getElementById('header-section-subtitle');
            
            if (targetSection === 'dashboard') {
                headerTitle.innerText = 'Contabilidad SENIAT';
                headerSubtitle.innerText = 'Libros Fiscales y Consolidado de IVA para Forma 30';
                renderGraficos();
            } else if (targetSection === 'compras') {
                headerTitle.innerText = 'Libro de Compras';
                headerSubtitle.innerText = 'Registro y Control de Compras Nacionales e Importaciones';
            } else if (targetSection === 'ventas') {
                headerTitle.innerText = 'Libro de Ventas';
                headerSubtitle.innerText = 'Registro y Control de Ventas Nacionales y Exportaciones';
            } else if (targetSection === 'contactos') {
                headerTitle.innerText = 'Clientes / Proveedores';
                headerSubtitle.innerText = 'Directorio Fiscal y R.I.F. de Terceros';
            } else if (targetSection === 'reportes') {
                headerTitle.innerText = 'Declaración del IVA (Forma 30)';
                headerSubtitle.innerText = 'Mapeo oficial de casillas para la declaración fiscal quincenal/mensual';
                generarForma30SENIAT();
            } else if (targetSection === 'beneficiarios') {
                headerTitle.innerText = 'Beneficiarios / Empresas';
                headerSubtitle.innerText = 'Gestión de Entidades Fiscales Registradas';
                renderTablaBeneficiarios();
            } else if (targetSection === 'configuracion') {
                headerTitle.innerText = 'Configuraciones Contables';
                headerSubtitle.innerText = 'Perfil corporativo, mantenimiento de datos y copias de seguridad';
            }
        });
    });

    // Toggle Sidebar Movil
    document.querySelector('.menu-toggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('active');
    });

    // Filtros de Libros
    document.getElementById('buscar-compras').addEventListener('input', filtrarCompras);
    document.getElementById('filtro-mes-compras').addEventListener('change', filtrarCompras);
    document.getElementById('filtro-periodo-compras').addEventListener('change', filtrarCompras);
    
    document.getElementById('buscar-ventas').addEventListener('input', filtrarVentas);
    document.getElementById('filtro-mes-ventas').addEventListener('change', filtrarVentas);
    document.getElementById('filtro-periodo-ventas').addEventListener('change', filtrarVentas);
    
    document.getElementById('buscar-contactos').addEventListener('input', filtrarContactos);
    document.getElementById('filtro-tipo-contactos').addEventListener('change', filtrarContactos);

    // Filtro de Beneficiarios
    document.getElementById('buscar-beneficiarios').addEventListener('input', filtrarBeneficiarios);

    // Selector de Beneficiario Activo en Sidebar
    document.getElementById('select-beneficiario-activo').addEventListener('change', (e) => {
        const id = parseInt(e.target.value);
        seleccionarBeneficiario(id);
    });

    // --- AUTOMATIC SHOW/HIDE (TOGGLES DE CAMPOS CONDICIONALES) ---
    const compraDocType = document.getElementById('compra-doc-type');
    const compraNotasFields = document.getElementById('compra-notas-fields');
    const compraNotaDebitoGroup = document.getElementById('compra-nota-debito-group');
    const compraNotaCreditoGroup = document.getElementById('compra-nota-credito-group');
    const compraDocAfectado = document.getElementById('compra-doc-afectado');

    window.toggleCompraNotasFields = function() {
        const type = compraDocType.value;
        if (type === 'Nota Crédito') {
            compraNotasFields.style.display = 'flex';
            compraNotaCreditoGroup.style.display = 'block';
            compraNotaDebitoGroup.style.display = 'none';
            compraDocAfectado.required = true;
        } else if (type === 'Nota Débito') {
            compraNotasFields.style.display = 'flex';
            compraNotaCreditoGroup.style.display = 'none';
            compraNotaDebitoGroup.style.display = 'block';
            compraDocAfectado.required = true;
        } else {
            compraNotasFields.style.display = 'none';
            compraNotaCreditoGroup.style.display = 'none';
            compraNotaDebitoGroup.style.display = 'none';
            compraDocAfectado.required = false;
        }
    };
    compraDocType.addEventListener('change', window.toggleCompraNotasFields);

    const compraTerritorialidad = document.getElementById('compra-territorialidad');
    const compraImportFields = document.getElementById('compra-import-fields');
    window.toggleCompraImportFields = function() {
        if (compraTerritorialidad.value === 'importacion') {
            compraImportFields.style.display = 'flex';
        } else {
            compraImportFields.style.display = 'none';
        }
    };
    compraTerritorialidad.addEventListener('change', window.toggleCompraImportFields);

    const ventaDocType = document.getElementById('venta-doc-type');
    const ventaNotasFields = document.getElementById('venta-notas-fields');
    const ventaNotaDebitoGroup = document.getElementById('venta-nota-debito-group');
    const ventaNotaCreditoGroup = document.getElementById('venta-nota-credito-group');
    const ventaDocAfectado = document.getElementById('venta-doc-afectado');

    window.toggleVentaNotasFields = function() {
        const type = ventaDocType.value;
        if (type === 'Nota Crédito') {
            ventaNotasFields.style.display = 'flex';
            ventaNotaCreditoGroup.style.display = 'block';
            ventaNotaDebitoGroup.style.display = 'none';
            ventaDocAfectado.required = true;
        } else if (type === 'Nota Débito') {
            ventaNotasFields.style.display = 'flex';
            ventaNotaCreditoGroup.style.display = 'none';
            ventaNotaDebitoGroup.style.display = 'block';
            ventaDocAfectado.required = true;
        } else {
            ventaNotasFields.style.display = 'none';
            ventaNotaCreditoGroup.style.display = 'none';
            ventaNotaDebitoGroup.style.display = 'none';
            ventaDocAfectado.required = false;
        }
    };
    ventaDocType.addEventListener('change', window.toggleVentaNotasFields);

    const ventaTerritorialidad = document.getElementById('venta-territorialidad');
    const ventaExportFields = document.getElementById('venta-export-fields');
    window.toggleVentaExportFields = function() {
        if (ventaTerritorialidad.value === 'exportacion') {
            ventaExportFields.style.display = 'flex';
        } else {
            ventaExportFields.style.display = 'none';
        }
    };
    ventaTerritorialidad.addEventListener('change', window.toggleVentaExportFields);

    const ventaIsFiscal = document.getElementById('venta-is-fiscal-printer');
    const ventaFiscalBox = document.getElementById('venta-fiscal-printer-box');
    ventaIsFiscal.addEventListener('change', () => {
        if (ventaIsFiscal.checked) {
            ventaFiscalBox.classList.add('active');
        } else {
            ventaFiscalBox.classList.remove('active');
        }
    });

    const ventaIsTerceros = document.getElementById('venta-is-terceros');
    const ventaTercerosBox = document.getElementById('venta-terceros-box');
    ventaIsTerceros.addEventListener('change', () => {
        if (ventaIsTerceros.checked) {
            ventaTercerosBox.classList.add('active');
        } else {
            ventaTercerosBox.classList.remove('active');
        }
    });

    // --- AUTO-CÁLCULOS MULTI-ALÍCUOTA Y RETENCIONES ---

    // Compras Triggers
    const cExenta = document.getElementById('compra-base-exenta');
    const cSinCredito = document.getElementById('compra-sin-credito');
    const cGeneral = document.getElementById('compra-base-general');
    const cIvaGeneral = document.getElementById('compra-iva-general');
    const cReducida = document.getElementById('compra-base-reducida');
    const cIvaReducida = document.getElementById('compra-iva-reducida');
    const cAdicional = document.getElementById('compra-base-adicional');
    const cIvaAdicional = document.getElementById('compra-iva-adicional');
    const cTotal = document.getElementById('compra-total');
    
    const cHasRet = document.getElementById('compra-has-retention');
    const cRetBox = document.getElementById('compra-retention-box');
    const cRetPct = document.getElementById('compra-retention-pct');
    const cRetPctCustom = document.getElementById('compra-retention-pct-custom');
    const cRetPctCustomGroup = document.getElementById('compra-ret-pct-custom-group');
    const cRetAmount = document.getElementById('compra-retention-amount');

    function recalcularTotalesCompra() {
        const baseExenta = parseFloat(cExenta.value) || 0;
        const sinCredito = parseFloat(cSinCredito.value) || 0;
        const baseGeneral = parseFloat(cGeneral.value) || 0;
        const baseReducida = parseFloat(cReducida.value) || 0;
        const baseAdicional = parseFloat(cAdicional.value) || 0;

        // Calcular IVAs
        const ivaGen = Math.round(baseGeneral * 0.16 * 100) / 100;
        const ivaRed = Math.round(baseReducida * 0.08 * 100) / 100;
        const ivaAdic = Math.round(baseAdicional * 0.31 * 100) / 100;

        cIvaGeneral.value = baseGeneral > 0 ? ivaGen.toFixed(2) : '';
        cIvaReducida.value = baseReducida > 0 ? ivaRed.toFixed(2) : '';
        cIvaAdicional.value = baseAdicional > 0 ? ivaAdic.toFixed(2) : '';

        // Calcular Total Factura (incluye compras sin derecho a crédito)
        const totalFactura = baseExenta + sinCredito + baseGeneral + ivaGen + baseReducida + ivaRed + baseAdicional + ivaAdic;
        cTotal.value = totalFactura > 0 ? totalFactura.toFixed(2) : '';

        // Recalcular Retención si aplica
        if (cHasRet.checked) {
            const totalIva = ivaGen + ivaRed + ivaAdic;
            let pct = 75;
            if (cRetPct.value === '100') pct = 100;
            else if (cRetPct.value === 'otro') pct = parseFloat(cRetPctCustom.value) || 0;

            const retVal = Math.round(totalIva * (pct / 100) * 100) / 100;
            cRetAmount.value = retVal > 0 ? retVal.toFixed(2) : '';
        }
    }

    cExenta.addEventListener('input', recalcularTotalesCompra);
    cSinCredito.addEventListener('input', recalcularTotalesCompra);
    cGeneral.addEventListener('input', recalcularTotalesCompra);
    cReducida.addEventListener('input', recalcularTotalesCompra);
    cAdicional.addEventListener('input', recalcularTotalesCompra);
    
    cHasRet.addEventListener('change', () => {
        if (cHasRet.checked) {
            cRetBox.classList.add('active');
            const docDate = document.getElementById('compra-date').value;
            if (docDate) document.getElementById('compra-retention-date').value = docDate;
        } else {
            cRetBox.classList.remove('active');
            cRetAmount.value = '';
            document.getElementById('compra-retention-number').value = '';
            document.getElementById('compra-retention-date').value = '';
            document.getElementById('compra-retencion-terceros').value = '';
        }
        recalcularTotalesCompra();
    });

    cRetPct.addEventListener('change', () => {
        if (cRetPct.value === 'otro') {
            cRetPctCustomGroup.style.display = 'block';
        } else {
            cRetPctCustomGroup.style.display = 'none';
        }
        recalcularTotalesCompra();
    });
    cRetPctCustom.addEventListener('input', recalcularTotalesCompra);

    // Ventas Triggers
    const vExenta = document.getElementById('venta-base-exenta');
    const vGeneral = document.getElementById('venta-base-general');
    const vIvaGeneral = document.getElementById('venta-iva-general');
    const vReducida = document.getElementById('venta-base-reducida');
    const vIvaReducida = document.getElementById('venta-iva-reducida');
    const vAdicional = document.getElementById('venta-base-adicional');
    const vIvaAdicional = document.getElementById('venta-iva-adicional');
    const vTotal = document.getElementById('venta-total');
    
    const vHasRet = document.getElementById('venta-has-retention');
    const vRetBox = document.getElementById('venta-retention-box');
    const vRetPct = document.getElementById('venta-retention-pct');
    const vRetPctCustom = document.getElementById('venta-retention-pct-custom');
    const vRetPctCustomGroup = document.getElementById('venta-ret-pct-custom-group');
    const vRetAmount = document.getElementById('venta-retention-amount');

    function recalcularTotalesVenta() {
        const baseExenta = parseFloat(vExenta.value) || 0;
        const baseGeneral = parseFloat(vGeneral.value) || 0;
        const baseReducida = parseFloat(vReducida.value) || 0;
        const baseAdicional = parseFloat(vAdicional.value) || 0;

        // Calcular IVAs
        const ivaGen = Math.round(baseGeneral * 0.16 * 100) / 100;
        const ivaRed = Math.round(baseReducida * 0.08 * 100) / 100;
        const ivaAdic = Math.round(baseAdicional * 0.31 * 100) / 100;

        vIvaGeneral.value = baseGeneral > 0 ? ivaGen.toFixed(2) : '';
        vIvaReducida.value = baseReducida > 0 ? ivaRed.toFixed(2) : '';
        vIvaAdicional.value = baseAdicional > 0 ? ivaAdic.toFixed(2) : '';

        // Calcular Total Factura
        const totalFactura = baseExenta + baseGeneral + ivaGen + baseReducida + ivaRed + baseAdicional + ivaAdic;
        vTotal.value = totalFactura > 0 ? totalFactura.toFixed(2) : '';

        // Recalcular Retención si aplica
        if (vHasRet.checked) {
            const totalIva = ivaGen + ivaRed + ivaAdic;
            let pct = 75;
            if (vRetPct.value === '100') pct = 100;
            else if (vRetPct.value === 'otro') pct = parseFloat(vRetPctCustom.value) || 0;

            const retVal = Math.round(totalIva * (pct / 100) * 100) / 100;
            vRetAmount.value = retVal > 0 ? retVal.toFixed(2) : '';
        }
    }

    vExenta.addEventListener('input', recalcularTotalesVenta);
    vGeneral.addEventListener('input', recalcularTotalesVenta);
    vReducida.addEventListener('input', recalcularTotalesVenta);
    vAdicional.addEventListener('input', recalcularTotalesVenta);
    
    vHasRet.addEventListener('change', () => {
        if (vHasRet.checked) {
            vRetBox.classList.add('active');
            const docDate = document.getElementById('venta-date').value;
            if (docDate) document.getElementById('venta-retention-date').value = docDate;
        } else {
            vRetBox.classList.remove('active');
            vRetAmount.value = '';
            document.getElementById('venta-retention-number').value = '';
            document.getElementById('venta-retention-date').value = '';
            document.getElementById('venta-iva-percibido-comprador').value = '';
        }
        recalcularTotalesVenta();
    });

    vRetPct.addEventListener('change', () => {
        if (vRetPct.value === 'otro') {
            vRetPctCustomGroup.style.display = 'block';
        } else {
            vRetPctCustomGroup.style.display = 'none';
        }
        recalcularTotalesVenta();
    });
    vRetPctCustom.addEventListener('input', recalcularTotalesVenta);

    // --- AUTOCOMPLETADO POR R.I.F. (Tax ID) ---
    document.getElementById('contacto-tax-id').addEventListener('blur', (e) => {
        const rif = e.target.value.trim().toUpperCase();
        const existente = state.contactos.find(c => c.tax_id.replace(/[- ]/g, '').toLowerCase() === rif.replace(/[- ]/g, '').toLowerCase());
        if (existente) {
            document.getElementById('contacto-name').value = existente.name;
            document.getElementById('contacto-email').value = existente.email || '';
            document.getElementById('contacto-phone').value = existente.phone || '';
            document.getElementById('contacto-address').value = existente.address || '';
            document.getElementById('contacto-type').value = existente.type;
            document.getElementById('contacto-especial').value = existente.especial || 'no';
            mostrarNotificacion(`R.I.F. existente. Se cargó la información de: ${existente.name}`, 'info');
        }
    });

    // Auto-detectar si el cliente/proveedor es Agente de Retención y sugerir check
    document.getElementById('compra-proveedor').addEventListener('change', (e) => {
        const contactId = parseInt(e.target.value);
        if (contactId === -1) {
            abrirModalContacto('proveedor');
            e.target.value = "";
            return;
        }
        
        const prov = state.contactos.find(c => c.id === contactId);
        if (prov) {
            if (state.config.empresaContribuyente === 'especial') {
                cHasRet.checked = true;
                cRetBox.classList.add('active');
                recalcularTotalesCompra();
            }
        }
    });

    document.getElementById('venta-cliente').addEventListener('change', (e) => {
        const contactId = parseInt(e.target.value);
        if (contactId === -1) {
            abrirModalContacto('cliente');
            e.target.value = "";
            return;
        }
        
        const cliente = state.contactos.find(c => c.id === contactId);
        if (cliente && cliente.especial === 'si') {
            vHasRet.checked = true;
            vRetBox.classList.add('active');
            recalcularTotalesVenta();
            mostrarNotificacion(`El cliente ${cliente.name} es Contribuyente Especial. Se activó la sección de Retención de IVA.`, 'info');
        } else {
            vHasRet.checked = false;
            vRetBox.classList.remove('active');
            recalcularTotalesVenta();
        }
    });

    // --- CONFIGURACIÓN TEMA Y DEMO ---

    document.getElementById('btn-toggle-theme').addEventListener('click', () => {
        state.config.theme = state.config.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', state.config.theme);
        guardarDatos();
    });

    document.getElementById('btn-cargar-demo').addEventListener('click', () => {
        if (confirm('¿Restablecer y cargar los datos de prueba de Venezuela? Se borrará lo que tengas registrado.')) {
            cargarDatosDemoVenezuela();
            renderAll();
            mostrarNotificacion('Datos de prueba venezolanos cargados con éxito.', 'success');
        }
    });

    document.getElementById('btn-limpiar-datos').addEventListener('click', () => {
        if (confirm('¡Peligro! Esto vaciará toda la contabilidad por completo.')) {
            cargarEstadoVacio();
            renderAll();
            mostrarNotificacion('Contabilidad vaciada. Empezando de cero.', 'warning');
        }
    });

    // Respaldos JSON
    document.getElementById('btn-exportar-json').addEventListener('click', exportarJSON);
    document.getElementById('btn-importar-json').addEventListener('click', () => {
        document.getElementById('input-file-importar').click();
    });
    document.getElementById('input-file-importar').addEventListener('change', importarJSON);

    // Listeners de los Ajustes F30
    document.getElementById('f30-v-ajuste-tax').addEventListener('change', (e) => {
        updateF30Ajuste('debito_ajuste', parseFloat(e.target.value) || 0);
    });
    document.getElementById('f30-v-exonerado-tax').addEventListener('change', (e) => {
        updateF30Ajuste('debito_exonerado', parseFloat(e.target.value) || 0);
    });
    document.getElementById('f30-c-excedente-anterior').addEventListener('change', (e) => {
        updateF30Ajuste('excedente_anterior', parseFloat(e.target.value) || 0);
    });
    document.getElementById('f30-c-ajuste-tax').addEventListener('change', (e) => {
        updateF30Ajuste('credito_ajuste_tax', parseFloat(e.target.value) || 0);
    });
}

// --- RENDERIZADORES DE UI ---

function renderAll() {
    renderKPIs();
    renderGraficos();
    renderSelectoresContactos();
    renderTablaCompras();
    renderTablaVentas();
    renderTablaContactos();
    renderSelectoresBeneficiarios();
    renderTablaBeneficiarios();
    
    // Renderizar indicador de empresa activa en cabecera
    const active = getActiveBeneficiary();
    const activeHeaderEl = document.getElementById('active-company-header');
    if (activeHeaderEl && active) {
        activeHeaderEl.innerHTML = `<svg style="width:16px;height:16px;stroke:var(--color-success);stroke-width:2;fill:none;" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg><span style="color:var(--text-secondary); font-weight:normal;">Empresa:</span> <span style="color:var(--color-success);">${active.tax_id} | ${active.name}</span>`;
    }
    
    // Configuración general cargada
    
    // Inicializar mes del reporte y quincena
    const inputReporteMes = document.getElementById('reporte-mes-select');
    if (inputReporteMes && !inputReporteMes.value) {
        inputReporteMes.value = new Date().toISOString().substring(0, 7);
    }
    const inputReportePeriodo = document.getElementById('reporte-periodo-select');
    if (inputReportePeriodo && !inputReportePeriodo.value) {
        inputReportePeriodo.value = 'completo';
    }
}

// KPIs
function renderKPIs() {
    const hoy = new Date();
    const mesActual = hoy.toISOString().substring(0, 7);
    
    // Filtrar mes actual
    const comprasMes = state.compras.filter(c => c.date.startsWith(mesActual));
    const ventasMes = state.ventas.filter(v => v.date.startsWith(mesActual));

    const totalVentas = ventasMes.reduce((acc, curr) => acc + curr.total_amount, 0);
    const totalCompras = comprasMes.reduce((acc, curr) => acc + curr.total_amount, 0);

    const ivaDebito = ventasMes.reduce((acc, curr) => acc + (curr.tax_general || 0) + (curr.tax_reducida || 0) + (curr.tax_adicional || 0), 0);
    const ivaCredito = comprasMes.reduce((acc, curr) => acc + (curr.tax_general || 0) + (curr.tax_reducida || 0) + (curr.tax_adicional || 0), 0);

    const retRecibidas = ventasMes.reduce((acc, curr) => acc + (curr.retention_amount || 0), 0);
    const retEmitidas = comprasMes.reduce((acc, curr) => acc + (curr.retention_amount || 0), 0);

    // Balance estimado: IVA Débito - IVA Crédito - Retenciones Recibidas
    const balanceEstimado = ivaDebito - ivaCredito - retRecibidas;

    // Rellenar UI
    document.getElementById('kpi-ventas-val').innerText = formatearMoneda(totalVentas);
    document.getElementById('kpi-compras-val').innerText = formatearMoneda(totalCompras);
    document.getElementById('kpi-ret-recibidas-val').innerText = formatearMoneda(retRecibidas);
    document.getElementById('kpi-ret-emitidas-val').innerText = formatearMoneda(retEmitidas);

    const kpiNetoCard = document.getElementById('kpi-neto-card');
    const kpiNetoVal = document.getElementById('kpi-neto-val');
    const kpiNetoSub = document.getElementById('kpi-neto-sub');

    kpiNetoCard.className = 'kpi-card kpi-neto';
    if (balanceEstimado >= 0) {
        kpiNetoCard.classList.add('saldo-pagar');
        kpiNetoVal.innerText = formatearMoneda(balanceEstimado);
        kpiNetoSub.innerText = 'IVA Neto estimado a pagar al SENIAT';
    } else {
        kpiNetoCard.classList.add('saldo-favor');
        kpiNetoVal.innerText = formatearMoneda(Math.abs(balanceEstimado));
        kpiNetoSub.innerText = 'Saldo fiscal estimado a favor';
    }
}

// Gráficos (Chart.js)
let chartInstance = null;
function renderGraficos() {
    const ctx = document.getElementById('chart-dashboard');
    if (!ctx) return;

    const meses = [];
    const comprasPorMes = [];
    const ventasPorMes = [];
    
    const hoy = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(hoy.getMonth() - i);
        const mesStr = d.toISOString().substring(0, 7);
        meses.push(formatearMesNombre(mesStr));
        
        const totalC = state.compras
            .filter(c => c.date.startsWith(mesStr))
            .reduce((acc, curr) => acc + curr.total_amount, 0);
            
        const totalV = state.ventas
            .filter(v => v.date.startsWith(mesStr))
            .reduce((acc, curr) => acc + curr.total_amount, 0);
            
        comprasPorMes.push(totalC);
        ventasPorMes.push(totalV);
    }

    if (window.Chart) {
        if (chartInstance) {
            chartInstance.destroy();
        }
        
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? '#374151' : '#e2e8f0';
        const textColor = isDark ? '#9ca3af' : '#475569';

        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: meses,
                datasets: [
                    {
                        label: 'Ventas (Bs.)',
                        data: ventasPorMes,
                        backgroundColor: '#f43f5e',
                        borderRadius: 6
                    },
                    {
                        label: 'Compras (Bs.)',
                        data: comprasPorMes,
                        backgroundColor: '#10b981',
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor, font: { family: 'Outfit', size: 11 } } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: textColor, font: { family: 'Outfit' } } },
                    y: {
                        grid: { color: gridColor },
                        ticks: { 
                            color: textColor, 
                            font: { family: 'Outfit' },
                            callback: function(value) { return 'Bs.' + value.toLocaleString(); }
                        }
                    }
                }
            }
        });
    } else {
        // Fallback offline CSS charts
        ctx.parentElement.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-secondary); text-align:center;">
                <p>Gráficos consolidados offline (sin CDN).</p>
                <div style="display:flex; gap:16px; margin-top:20px; align-items:flex-end; height:120px;">
                    ${ventasPorMes.map((v, idx) => {
                        const max = Math.max(...ventasPorMes, ...comprasPorMes) || 1;
                        const pctV = (v / max) * 100;
                        const pctC = (comprasPorMes[idx] / max) * 100;
                        return `
                            <div style="display:flex; flex-direction:column; align-items:center;">
                                <div style="display:flex; align-items:flex-end; gap:4px; height:100px;">
                                    <div style="background:#f43f5e; width:15px; height:${pctV}px; border-radius:3px;" title="Ventas: Bs.${v.toLocaleString()}"></div>
                                    <div style="background:#10b981; width:15px; height:${pctC}px; border-radius:3px;" title="Compras: Bs.${comprasPorMes[idx].toLocaleString()}"></div>
                                </div>
                                <span style="font-size:10px; margin-top:4px;">${meses[idx].substring(0,3)}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
}

// Selectores de Contactos en Modales
function renderSelectoresContactos() {
    const provSelect = document.getElementById('compra-proveedor');
    const cliSelect = document.getElementById('venta-cliente');
    
    if (!provSelect || !cliSelect) return;

    // Proveedores
    const proveedores = state.contactos.filter(c => c.type === 'proveedor');
    let provHTML = '<option value="" disabled selected>Seleccione un Proveedor...</option>';
    proveedores.forEach(p => {
        provHTML += `<option value="${p.id}">${p.tax_id} | ${p.name}</option>`;
    });
    provHTML += '<option value="-1" style="color:var(--color-primary); font-weight:600;">+ Agregar Nuevo Proveedor...</option>';
    provSelect.innerHTML = provHTML;
    
    // Clientes
    const clientes = state.contactos.filter(c => c.type === 'cliente');
    let cliHTML = '<option value="" disabled selected>Seleccione un Cliente...</option>';
    clientes.forEach(c => {
        cliHTML += `<option value="${c.id}">${c.tax_id} | ${c.name}</option>`;
    });
    cliHTML += '<option value="-1" style="color:var(--color-primary); font-weight:600;">+ Agregar Nuevo Cliente...</option>';
    cliSelect.innerHTML = cliHTML;
}

// Listado Libro de Compras
function renderTablaCompras(filtradas = null) {
    const tbody = document.getElementById('tabla-compras-body');
    if (!tbody) return;

    const datos = filtradas || state.compras;
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="21" class="text-center text-muted">No se encontraron registros de compras.</td></tr>';
        return;
    }

    const ordenadas = [...datos].sort((a, b) => new Date(b.date) - new Date(a.date));
    let html = '';
    ordenadas.forEach((c, idx) => {
        const prov = state.contactos.find(con => con.id === c.contact_id);
        const provNombre = prov ? prov.name : '<span class="text-muted">Desconocido</span>';
        const provRut = prov ? prov.tax_id : '';
        
        const operNum = ordenadas.length - idx;

        html += `
            <tr>
                <td>${operNum}</td>
                <td>${formatearFechaISOaUI(c.date)}</td>
                <td><span class="font-semibold">${provRut}</span></td>
                <td>
                    <div style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${provNombre}">${provNombre}</div>
                </td>
                <td>
                    <div style="font-size:0.8rem; font-weight:600;">Forma D: ${c.export_form_d || '-'}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">Exp: ${c.import_expediente || '-'}</div>
                </td>
                <td><span class="font-semibold">${c.doc_type === 'Factura' ? c.doc_number : '-'}</span></td>
                <td>${c.control_number || '-'}</td>
                <td>${c.doc_type === 'Nota Débito' ? c.nota_debito || c.doc_number : '-'}</td>
                <td>${c.doc_type === 'Nota Crédito' ? c.nota_credito || c.doc_number : '-'}</td>
                <td>${c.doc_afectado || '-'}</td>
                <td class="text-right font-semibold">${formatearMoneda(c.total_amount)}</td>
                <td class="text-right">${formatearMoneda(c.base_exenta || 0)}</td>
                <td class="text-right">${formatearMoneda(c.sin_credito || 0)}</td>
                <td class="text-right">${formatearMoneda(c.base_general || 0)}</td>
                <td class="text-right">${formatearMoneda(c.tax_general || 0)}</td>
                <td class="text-right" style="font-size:0.8rem; color:var(--text-secondary);">
                    Base: ${formatearMoneda((c.base_reducida || 0) + (c.base_adicional || 0))}<br>
                    IVA: ${formatearMoneda((c.tax_reducida || 0) + (c.tax_adicional || 0))}
                </td>
                <td class="text-right text-danger font-semibold">${c.has_retention ? formatearMoneda(c.retention_amount) : '-'}</td>
                <td class="text-right">${c.retencion_terceros ? formatearMoneda(c.retencion_terceros) : '-'}</td>
                <td class="text-right">${c.iva_percibido_aduana ? formatearMoneda(c.iva_percibido_aduana) : '-'}</td>
                <td>
                    <div style="font-size:0.8rem; font-weight:600;">${c.retention_number || '-'}</div>
                    <div style="font-size:0.7rem; color:var(--text-secondary);">${c.retention_date ? formatearFechaISOaUI(c.retention_date) : ''}</div>
                </td>
                <td>
                    <div class="flex gap-8">
                        <button class="btn btn-secondary btn-icon-only" onclick="editarTransaccion('compra', ${c.id})" title="Editar">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                        </button>
                        <button class="btn btn-danger btn-icon-only" onclick="eliminarTransaccion('compra', ${c.id})" title="Eliminar">
                            <svg viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6m4-16v16"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// Listado Libro de Ventas
function renderTablaVentas(filtradas = null) {
    const tbody = document.getElementById('tabla-ventas-body');
    if (!tbody) return;

    const datos = filtradas || state.ventas;
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="21" class="text-center text-muted">No se encontraron registros de ventas.</td></tr>';
        return;
    }

    const ordenadas = [...datos].sort((a, b) => new Date(b.date) - new Date(a.date));
    let html = '';
    ordenadas.forEach((v, idx) => {
        const cli = state.contactos.find(con => con.id === v.contact_id);
        const cliNombre = cli ? cli.name : '<span class="text-muted">Desconocido</span>';
        const cliRut = cli ? cli.tax_id : '';
        
        const operNum = ordenadas.length - idx;

        html += `
            <tr>
                <td>${operNum}</td>
                <td>${formatearFechaISOaUI(v.date)}</td>
                <td><span class="font-semibold">${cliRut}</span></td>
                <td>
                    <div style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${cliNombre}">${cliNombre}</div>
                </td>
                <td>
                    <div style="font-size:0.8rem; font-weight:600;">Máq: ${v.fiscal_machine || '-'}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">Z: ${v.control_z || '-'}</div>
                </td>
                <td>${v.export_form_d || '-'}</td>
                <td><span class="font-semibold">${v.doc_type === 'Factura' ? v.doc_number : '-'}</span></td>
                <td>${v.control_number || '-'}</td>
                <td>${v.doc_type === 'Nota Débito' ? v.nota_debito || v.doc_number : '-'}</td>
                <td>${v.doc_type === 'Nota Crédito' ? v.nota_credito || v.doc_number : '-'}</td>
                <td>${v.doc_afectado || '-'}</td>
                <td class="text-right font-semibold">${formatearMoneda(v.total_amount)}</td>
                <td class="text-right">${formatearMoneda(v.base_exenta || 0)}</td>
                <td class="text-right">${formatearMoneda(v.base_general || 0)}</td>
                <td class="text-right">${formatearMoneda(v.tax_general || 0)}</td>
                <td class="text-right" style="font-size:0.8rem; color:var(--text-secondary);">
                    Base: ${formatearMoneda((v.base_reducida || 0) + (v.base_adicional || 0))}<br>
                    IVA: ${formatearMoneda((v.tax_reducida || 0) + (v.tax_adicional || 0))}
                </td>
                <td class="text-right text-success font-semibold">${v.has_retention ? formatearMoneda(v.retention_amount) : '-'}</td>
                <td class="text-right">${v.iva_percibido_comprador ? formatearMoneda(v.iva_percibido_comprador) : '-'}</td>
                <td class="text-right" style="font-size:0.8rem; color:var(--text-secondary);">
                    Total: ${formatearMoneda(v.ventas_terceros_total || 0)}<br>
                    Exento: ${formatearMoneda(v.ventas_terceros_exentas || 0)}<br>
                    Gravado: ${formatearMoneda(v.ventas_terceros_gravadas || 0)}
                </td>
                <td>
                    <div style="font-size:0.8rem; font-weight:600;">${v.retention_number || '-'}</div>
                    <div style="font-size:0.7rem; color:var(--text-secondary);">${v.retention_date ? formatearFechaISOaUI(v.retention_date) : ''}</div>
                </td>
                <td>
                    <div class="flex gap-8">
                        <button class="btn btn-secondary btn-icon-only" onclick="editarTransaccion('venta', ${v.id})" title="Editar">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                        </button>
                        <button class="btn btn-danger btn-icon-only" onclick="eliminarTransaccion('venta', ${v.id})" title="Eliminar">
                            <svg viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6m4-16v16"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// Listado de Contactos
function renderTablaContactos(filtrados = null) {
    const tbody = document.getElementById('tabla-contactos-body');
    if (!tbody) return;

    const datos = filtrados || state.contactos;
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No hay contactos registrados.</td></tr>';
        return;
    }

    const ordenados = [...datos].sort((a, b) => a.name.localeCompare(b.name));
    let html = '';
    ordenados.forEach(c => {
        const typeBadge = c.type === 'proveedor' ? 'badge-success' : 'badge-danger';
        const espBadge = c.especial === 'si' ? '<span class="badge badge-success">SÍ</span>' : '<span class="badge badge-warning">NO</span>';
        
        html += `
            <tr>
                <td><span class="font-semibold">${c.tax_id}</span></td>
                <td><span class="font-semibold">${c.name}</span></td>
                <td><span class="badge ${typeBadge}">${c.type}</span></td>
                <td>${espBadge}</td>
                <td>${c.email || '-'}</td>
                <td>${c.phone || '-'}</td>
                <td>${c.address || '-'}</td>
                <td>
                    <div class="flex gap-8">
                        <button class="btn btn-secondary btn-icon-only" onclick="editarContacto(${c.id})" title="Editar">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                        </button>
                        <button class="btn btn-danger btn-icon-only" onclick="eliminarContacto(${c.id})" title="Eliminar">
                            <svg viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6m4-16v16"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// --- FILTROS DE BÚSQUEDA POR QUINCENAS ---

function checkFiltroQuincena(dateStr, quincenaVal) {
    if (!quincenaVal || quincenaVal === 'completo') return true;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return true;
    const dia = parseInt(parts[2], 10);
    if (quincenaVal === 'q1') {
        return dia <= 15;
    } else if (quincenaVal === 'q2') {
        return dia >= 16;
    }
    return true;
}

function filtrarCompras() {
    const query = document.getElementById('buscar-compras').value.toLowerCase();
    const mesVal = document.getElementById('filtro-mes-compras').value;
    const quincenaVal = document.getElementById('filtro-periodo-compras').value;

    const filtradas = state.compras.filter(c => {
        const prov = state.contactos.find(con => con.id === c.contact_id);
        const matchText = (prov ? prov.name : '').toLowerCase().includes(query) ||
                          (prov ? prov.tax_id : '').toLowerCase().includes(query) ||
                          c.doc_number.toLowerCase().includes(query) ||
                          (c.control_number || '').toLowerCase().includes(query);
                          
        const matchMes = mesVal ? c.date.startsWith(mesVal) : true;
        const matchQuincena = checkFiltroQuincena(c.date, quincenaVal);

        return matchText && matchMes && matchQuincena;
    });
    renderTablaCompras(filtradas);
}

function filtrarVentas() {
    const query = document.getElementById('buscar-ventas').value.toLowerCase();
    const mesVal = document.getElementById('filtro-mes-ventas').value;
    const quincenaVal = document.getElementById('filtro-periodo-ventas').value;

    const filtradas = state.ventas.filter(v => {
        const cli = state.contactos.find(con => con.id === v.contact_id);
        const matchText = (cli ? cli.name : '').toLowerCase().includes(query) ||
                          (cli ? cli.tax_id : '').toLowerCase().includes(query) ||
                          v.doc_number.toLowerCase().includes(query) ||
                          (v.control_number || '').toLowerCase().includes(query);
                          
        const matchMes = mesVal ? v.date.startsWith(mesVal) : true;
        const matchQuincena = checkFiltroQuincena(v.date, quincenaVal);

        return matchText && matchMes && matchQuincena;
    });
    renderTablaVentas(filtradas);
}

function filtrarContactos() {
    const query = document.getElementById('buscar-contactos').value.toLowerCase();
    const tipoVal = document.getElementById('filtro-tipo-contactos').value;

    const filtrados = state.contactos.filter(c => {
        const matchText = c.name.toLowerCase().includes(query) ||
                          c.tax_id.toLowerCase().includes(query) ||
                          (c.email || '').toLowerCase().includes(query);
        const matchTipo = tipoVal ? c.type === tipoVal : true;
        return matchText && matchTipo;
    });
    renderTablaContactos(filtrados);
}

// --- CRUD OPERACIONES ---

// --- Contactos ---
function abrirModalContacto(tipoDefault = 'cliente') {
    document.getElementById('form-contacto').reset();
    document.getElementById('contacto-id').value = '';
    if (document.getElementById('contacto-documento-tipo')) {
        document.getElementById('contacto-documento-tipo').value = 'RIF';
    }
    document.getElementById('contacto-type').value = tipoDefault;
    document.getElementById('contacto-especial').value = 'no';
    document.getElementById('modal-contacto-title').innerText = 'Registrar R.I.F. de Contacto';
    document.getElementById('modal-contacto').classList.add('active');
}
function cerrarModalContacto() {
    document.getElementById('modal-contacto').classList.remove('active');
}

document.getElementById('form-contacto').addEventListener('submit', (e) => {
    e.preventDefault();
    const idVal = document.getElementById('contacto-id').value;
    const taxId = document.getElementById('contacto-tax-id').value.trim().toUpperCase();
    const name = document.getElementById('contacto-name').value.trim();
    const type = document.getElementById('contacto-type').value;
    const especial = document.getElementById('contacto-especial').value;
    const email = document.getElementById('contacto-email').value.trim();
    const phone = document.getElementById('contacto-phone').value.trim();
    const address = document.getElementById('contacto-address').value.trim();

    if (!taxId || !name) {
        mostrarNotificacion('R.I.F. y Razón Social son obligatorios.', 'warning');
        return;
    }

    if (idVal) {
        const idx = state.contactos.findIndex(c => c.id === parseInt(idVal));
        if (idx !== -1) {
            state.contactos[idx] = { id: parseInt(idVal), tax_id: taxId, name, type, especial, email, phone, address };
            mostrarNotificacion('Contacto fiscal actualizado.', 'success');
        }
    } else {
        const nuevoId = state.contactos.length > 0 ? Math.max(...state.contactos.map(c => c.id)) + 1 : 1;
        state.contactos.push({ id: nuevoId, tax_id: taxId, name, type, especial, email, phone, address });
        mostrarNotificacion('Nuevo R.I.F. guardado con éxito.', 'success');
    }

    guardarDatos();
    renderAll();
    cerrarModalContacto();
});

function editarContacto(id) {
    const c = state.contactos.find(item => item.id === id);
    if (!c) return;

    document.getElementById('contacto-id').value = c.id;
    if (document.getElementById('contacto-documento-tipo')) {
        document.getElementById('contacto-documento-tipo').value = determinarTipoDoc(c.tax_id);
    }
    document.getElementById('contacto-tax-id').value = c.tax_id;
    document.getElementById('contacto-name').value = c.name;
    document.getElementById('contacto-type').value = c.type;
    document.getElementById('contacto-especial').value = c.especial || 'no';
    document.getElementById('contacto-email').value = c.email || '';
    document.getElementById('contacto-phone').value = c.phone || '';
    document.getElementById('contacto-address').value = c.address || '';

    document.getElementById('modal-contacto-title').innerText = 'Modificar Registro Fiscal';
    document.getElementById('modal-contacto').classList.add('active');
}

function eliminarContacto(id) {
    const c = state.contactos.find(item => item.id === id);
    if (!c) return;

    const enCompras = state.compras.some(comp => comp.contact_id === id);
    const enVentas = state.ventas.some(v => v.contact_id === id);
    
    if (enCompras || enVentas) {
        mostrarNotificacion('No se puede borrar. R.I.F. asociado a transacciones de libros.', 'danger');
        return;
    }

    if (confirm(`¿Deseas eliminar a "${c.name}"?`)) {
        state.contactos = state.contactos.filter(item => item.id !== id);
        guardarDatos();
        renderAll();
        mostrarNotificacion('Contacto eliminado.', 'success');
    }
}

// --- Compras ---
function abrirModalCompra() {
    document.getElementById('form-compra').reset();
    document.getElementById('compra-id').value = '';
    document.getElementById('compra-date').value = new Date().toISOString().substring(0, 10);
    document.getElementById('compra-retention-box').classList.remove('active');
    document.getElementById('compra-ret-pct-custom-group').style.display = 'none';
    document.getElementById('modal-compra-title').innerText = 'Registrar Factura de Compra';
    
    // Reset new fields
    document.getElementById('compra-export-form-d').value = '';
    document.getElementById('compra-import-expediente').value = '';
    document.getElementById('compra-nota-debito').value = '';
    document.getElementById('compra-nota-credito').value = '';
    document.getElementById('compra-sin-credito').value = '';
    document.getElementById('compra-retencion-terceros').value = '';
    document.getElementById('compra-iva-percibido-aduana').value = '';
    document.getElementById('compra-territorialidad').value = 'nacional';
    
    if (window.toggleCompraImportFields) window.toggleCompraImportFields();
    if (window.toggleCompraNotasFields) window.toggleCompraNotasFields();
    
    renderSelectoresContactos();
    document.getElementById('modal-compra').classList.add('active');
}
function cerrarModalCompra() {
    document.getElementById('modal-compra').classList.remove('active');
}

document.getElementById('form-compra').addEventListener('submit', (e) => {
    e.preventDefault();
    const idVal = document.getElementById('compra-id').value;
    
    const date = document.getElementById('compra-date').value;
    const doc_type = document.getElementById('compra-doc-type').value;
    const doc_afectado = document.getElementById('compra-doc-afectado').value.trim();
    const doc_number = document.getElementById('compra-doc-number').value.trim();
    const control_number = document.getElementById('compra-control-number').value.trim();
    const contact_id = parseInt(document.getElementById('compra-proveedor').value);
    const is_import = document.getElementById('compra-territorialidad').value === 'importacion';

    // Desglose
    const base_exenta = parseFloat(document.getElementById('compra-base-exenta').value) || 0;
    const sin_credito = parseFloat(document.getElementById('compra-sin-credito').value) || 0;
    const base_general = parseFloat(document.getElementById('compra-base-general').value) || 0;
    const tax_general = parseFloat(document.getElementById('compra-iva-general').value) || 0;
    const base_reducida = parseFloat(document.getElementById('compra-base-reducida').value) || 0;
    const tax_reducida = parseFloat(document.getElementById('compra-iva-reducida').value) || 0;
    const base_adicional = parseFloat(document.getElementById('compra-base-adicional').value) || 0;
    const tax_adicional = parseFloat(document.getElementById('compra-iva-adicional').value) || 0;
    const total_amount = parseFloat(document.getElementById('compra-total').value) || 0;
    
    const status = document.getElementById('compra-status').value;
    const notes = document.getElementById('compra-notes').value.trim();

    // Retención
    const has_ret = document.getElementById('compra-has-retention').checked;
    const retention_pct_select = document.getElementById('compra-retention-pct').value;
    let retention_pct = 75;
    if (retention_pct_select === '100') retention_pct = 100;
    else if (retention_pct_select === 'otro') retention_pct = parseFloat(document.getElementById('compra-retention-pct-custom').value) || 0;
    
    const retention_amount = has_ret ? parseFloat(document.getElementById('compra-retention-amount').value) || 0 : 0;
    const retention_number = has_ret ? document.getElementById('compra-retention-number').value.trim() : '';
    const retention_date = has_ret ? document.getElementById('compra-retention-date').value : '';

    const export_form_d = is_import ? document.getElementById('compra-export-form-d').value.trim() : '';
    const import_expediente = is_import ? document.getElementById('compra-import-expediente').value.trim() : '';
    const nota_debito = doc_type === 'Nota Débito' ? document.getElementById('compra-nota-debito').value.trim() : '';
    const nota_credito = doc_type === 'Nota Crédito' ? document.getElementById('compra-nota-credito').value.trim() : '';
    const retencion_terceros = has_ret ? (parseFloat(document.getElementById('compra-retencion-terceros').value) || 0) : 0;
    const iva_percibido_aduana = is_import ? (parseFloat(document.getElementById('compra-iva-percibido-aduana').value) || 0) : 0;

    if (!date || !doc_number || !control_number || !contact_id || (total_amount <= 0 && doc_type === 'Factura')) {
        mostrarNotificacion('Completa los campos requeridos de la factura fiscal.', 'warning');
        return;
    }

    const payload = {
        type: 'compra',
        date, doc_type, doc_afectado, doc_number, control_number, contact_id,
        is_import_export: is_import,
        base_exenta, base_general, tax_general, base_reducida, tax_reducida, base_adicional, tax_adicional,
        net_amount: base_general + base_reducida + base_adicional,
        tax_amount: tax_general + tax_reducida + tax_adicional,
        total_amount,
        has_retention: has_ret, retention_pct, retention_amount, retention_number, retention_date,
        status, notes,
        export_form_d, import_expediente, nota_debito, nota_credito, sin_credito, retencion_terceros, iva_percibido_aduana
    };

    if (idVal) {
        const idx = state.compras.findIndex(c => c.id === parseInt(idVal));
        if (idx !== -1) {
            state.compras[idx] = { id: parseInt(idVal), ...payload };
            mostrarNotificacion('Factura de compra actualizada.', 'success');
        }
    } else {
        const nuevoId = state.compras.length > 0 ? Math.max(...state.compras.map(c => c.id)) + 1 : 1;
        state.compras.push({ id: nuevoId, ...payload });
        mostrarNotificacion('Factura registrada en el Libro de Compras.', 'success');
    }

    guardarDatos();
    renderAll();
    cerrarModalCompra();
});

// --- Ventas ---
function abrirModalVenta() {
    document.getElementById('form-venta').reset();
    document.getElementById('venta-id').value = '';
    document.getElementById('venta-date').value = new Date().toISOString().substring(0, 10);
    document.getElementById('venta-retention-box').classList.remove('active');
    document.getElementById('venta-ret-pct-custom-group').style.display = 'none';
    document.getElementById('modal-venta-title').innerText = 'Registrar Factura de Venta';
    
    // Reset new fields
    document.getElementById('venta-export-form-d').value = '';
    document.getElementById('venta-nota-debito').value = '';
    document.getElementById('venta-nota-credito').value = '';
    document.getElementById('venta-iva-percibido-comprador').value = '';
    
    document.getElementById('venta-is-fiscal-printer').checked = false;
    document.getElementById('venta-fiscal-printer-box').classList.remove('active');
    document.getElementById('venta-fiscal-machine').value = '';
    document.getElementById('venta-control-z').value = '';

    document.getElementById('venta-is-terceros').checked = false;
    document.getElementById('venta-terceros-box').classList.remove('active');
    document.getElementById('venta-terceros-total').value = '';
    document.getElementById('venta-terceros-exentas').value = '';
    document.getElementById('venta-terceros-gravadas').value = '';
    
    document.getElementById('venta-territorialidad').value = 'nacional';
    
    if (window.toggleVentaExportFields) window.toggleVentaExportFields();
    if (window.toggleVentaNotasFields) window.toggleVentaNotasFields();

    renderSelectoresContactos();
    document.getElementById('modal-venta').classList.add('active');
}
function cerrarModalVenta() {
    document.getElementById('modal-venta').classList.remove('active');
}

document.getElementById('form-venta').addEventListener('submit', (e) => {
    e.preventDefault();
    const idVal = document.getElementById('venta-id').value;
    
    const date = document.getElementById('venta-date').value;
    const doc_type = document.getElementById('venta-doc-type').value;
    const doc_afectado = document.getElementById('venta-doc-afectado').value.trim();
    const doc_number = document.getElementById('venta-doc-number').value.trim();
    const control_number = document.getElementById('venta-control-number').value.trim();
    const contact_id = parseInt(document.getElementById('venta-cliente').value);
    const is_export = document.getElementById('venta-territorialidad').value === 'exportacion';

    // Desglose
    const base_exenta = parseFloat(document.getElementById('venta-base-exenta').value) || 0;
    const base_general = parseFloat(document.getElementById('venta-base-general').value) || 0;
    const tax_general = parseFloat(document.getElementById('venta-iva-general').value) || 0;
    const base_reducida = parseFloat(document.getElementById('venta-base-reducida').value) || 0;
    const tax_reducida = parseFloat(document.getElementById('venta-iva-reducida').value) || 0;
    const base_adicional = parseFloat(document.getElementById('venta-base-adicional').value) || 0;
    const tax_adicional = parseFloat(document.getElementById('venta-iva-adicional').value) || 0;
    const total_amount = parseFloat(document.getElementById('venta-total').value) || 0;
    
    const status = document.getElementById('venta-status').value;
    const notes = document.getElementById('venta-notes').value.trim();

    // Retención
    const has_ret = document.getElementById('venta-has-retention').checked;
    const retention_pct_select = document.getElementById('venta-retention-pct').value;
    let retention_pct = 75;
    if (retention_pct_select === '100') retention_pct = 100;
    else if (retention_pct_select === 'otro') retention_pct = parseFloat(document.getElementById('venta-retention-pct-custom').value) || 0;
    
    const retention_amount = has_ret ? parseFloat(document.getElementById('venta-retention-amount').value) || 0 : 0;
    const retention_number = has_ret ? document.getElementById('venta-retention-number').value.trim() : '';
    const retention_date = has_ret ? document.getElementById('venta-retention-date').value : '';

    // Nuevos campos
    const fiscal_machine = document.getElementById('venta-is-fiscal-printer').checked ? document.getElementById('venta-fiscal-machine').value.trim() : '';
    const control_z = document.getElementById('venta-is-fiscal-printer').checked ? document.getElementById('venta-control-z').value.trim() : '';
    const export_form_d = is_export ? document.getElementById('venta-export-form-d').value.trim() : '';
    const nota_debito = doc_type === 'Nota Débito' ? document.getElementById('venta-nota-debito').value.trim() : '';
    const nota_credito = doc_type === 'Nota Crédito' ? document.getElementById('venta-nota-credito').value.trim() : '';
    const iva_percibido_comprador = has_ret ? (parseFloat(document.getElementById('venta-iva-percibido-comprador').value) || 0) : 0;
    const ventas_terceros_total = document.getElementById('venta-is-terceros').checked ? (parseFloat(document.getElementById('venta-terceros-total').value) || 0) : 0;
    const ventas_terceros_exentas = document.getElementById('venta-is-terceros').checked ? (parseFloat(document.getElementById('venta-terceros-exentas').value) || 0) : 0;
    const ventas_terceros_gravadas = document.getElementById('venta-is-terceros').checked ? (parseFloat(document.getElementById('venta-terceros-gravadas').value) || 0) : 0;

    if (!date || !doc_number || !control_number || !contact_id || (total_amount <= 0 && doc_type === 'Factura')) {
        mostrarNotificacion('Completa los campos requeridos de la factura fiscal.', 'warning');
        return;
    }

    const payload = {
        type: 'venta',
        date, doc_type, doc_afectado, doc_number, control_number, contact_id,
        is_import_export: is_export,
        base_exenta, base_general, tax_general, base_reducida, tax_reducida, base_adicional, tax_adicional,
        net_amount: base_general + base_reducida + base_adicional,
        tax_amount: tax_general + tax_reducida + tax_adicional,
        total_amount,
        has_retention: has_ret, retention_pct, retention_amount, retention_number, retention_date,
        status, notes,
        fiscal_machine, control_z, export_form_d, nota_debito, nota_credito, iva_percibido_comprador,
        ventas_terceros_total, ventas_terceros_exentas, ventas_terceros_gravadas
    };

    if (idVal) {
        const idx = state.ventas.findIndex(v => v.id === parseInt(idVal));
        if (idx !== -1) {
            state.ventas[idx] = { id: parseInt(idVal), ...payload };
            mostrarNotificacion('Factura de venta actualizada.', 'success');
        }
    } else {
        const nuevoId = state.ventas.length > 0 ? Math.max(...state.ventas.map(v => v.id)) + 1 : 1;
        state.ventas.push({ id: nuevoId, ...payload });
        mostrarNotificacion('Factura registrada en el Libro de Ventas.', 'success');
    }

    guardarDatos();
    renderAll();
    cerrarModalVenta();
});

// Editar transacciones (globales)
window.editarTransaccion = function(tipo, id) {
    renderSelectoresContactos();
    
    if (tipo === 'compra') {
        const item = state.compras.find(c => c.id === id);
        if (!item) return;

        document.getElementById('compra-id').value = item.id;
        document.getElementById('compra-date').value = item.date;
        document.getElementById('compra-doc-type').value = item.doc_type;
        document.getElementById('compra-doc-afectado').value = item.doc_afectado || '';
        document.getElementById('compra-doc-number').value = item.doc_number;
        document.getElementById('compra-control-number').value = item.control_number || '';
        document.getElementById('compra-proveedor').value = item.contact_id;
        document.getElementById('compra-territorialidad').value = item.is_import_export ? 'importacion' : 'nacional';
        
        document.getElementById('compra-base-exenta').value = item.base_exenta || '';
        document.getElementById('compra-sin-credito').value = item.sin_credito || '';
        document.getElementById('compra-base-general').value = item.base_general || '';
        document.getElementById('compra-iva-general').value = item.tax_general || '';
        document.getElementById('compra-base-reducida').value = item.base_reducida || '';
        document.getElementById('compra-iva-reducida').value = item.tax_reducida || '';
        document.getElementById('compra-base-adicional').value = item.base_adicional || '';
        document.getElementById('compra-iva-adicional').value = item.tax_adicional || '';
        
        document.getElementById('compra-export-form-d').value = item.export_form_d || '';
        document.getElementById('compra-import-expediente').value = item.import_expediente || '';
        document.getElementById('compra-nota-debito').value = item.nota_debito || '';
        document.getElementById('compra-nota-credito').value = item.nota_credito || '';
        
        document.getElementById('compra-total').value = item.total_amount;
        document.getElementById('compra-status').value = item.status;
        document.getElementById('compra-notes').value = item.notes || '';

        const checkRet = document.getElementById('compra-has-retention');
        const boxRet = document.getElementById('compra-retention-box');
        checkRet.checked = item.has_retention || false;
        
        if (item.has_retention) {
            boxRet.classList.add('active');
            const pctVal = item.retention_pct === 75 || item.retention_pct === 100 ? item.retention_pct.toString() : 'otro';
            document.getElementById('compra-retention-pct').value = pctVal;
            if (pctVal === 'otro') {
                document.getElementById('compra-ret-pct-custom-group').style.display = 'block';
                document.getElementById('compra-retention-pct-custom').value = item.retention_pct;
            } else {
                document.getElementById('compra-ret-pct-custom-group').style.display = 'none';
            }
            document.getElementById('compra-retention-amount').value = item.retention_amount || '';
            document.getElementById('compra-retention-number').value = item.retention_number || '';
            document.getElementById('compra-retention-date').value = item.retention_date || '';
            document.getElementById('compra-retencion-terceros').value = item.retencion_terceros || '';
        } else {
            boxRet.classList.remove('active');
            document.getElementById('compra-ret-pct-custom-group').style.display = 'none';
            document.getElementById('compra-retencion-terceros').value = '';
        }

        document.getElementById('compra-iva-percibido-aduana').value = item.iva_percibido_aduana || '';

        if (window.toggleCompraNotasFields) window.toggleCompraNotasFields();
        if (window.toggleCompraImportFields) window.toggleCompraImportFields();

        document.getElementById('modal-compra-title').innerText = 'Modificar Factura de Compra';
        document.getElementById('modal-compra').classList.add('active');
        
    } else {
        const item = state.ventas.find(v => v.id === id);
        if (!item) return;

        document.getElementById('venta-id').value = item.id;
        document.getElementById('venta-date').value = item.date;
        document.getElementById('venta-doc-type').value = item.doc_type;
        document.getElementById('venta-doc-afectado').value = item.doc_afectado || '';
        document.getElementById('venta-doc-number').value = item.doc_number;
        document.getElementById('venta-control-number').value = item.control_number || '';
        document.getElementById('venta-cliente').value = item.contact_id;
        document.getElementById('venta-territorialidad').value = item.is_import_export ? 'exportacion' : 'nacional';
        
        document.getElementById('venta-base-exenta').value = item.base_exenta || '';
        document.getElementById('venta-base-general').value = item.base_general || '';
        document.getElementById('venta-iva-general').value = item.tax_general || '';
        document.getElementById('venta-base-reducida').value = item.base_reducida || '';
        document.getElementById('venta-iva-reducida').value = item.tax_reducida || '';
        document.getElementById('venta-base-adicional').value = item.base_adicional || '';
        document.getElementById('venta-iva-adicional').value = item.tax_adicional || '';
        
        document.getElementById('venta-export-form-d').value = item.export_form_d || '';
        document.getElementById('venta-nota-debito').value = item.nota_debito || '';
        document.getElementById('venta-nota-credito').value = item.nota_credito || '';
        
        document.getElementById('venta-total').value = item.total_amount;
        document.getElementById('venta-status').value = item.status;
        document.getElementById('venta-notes').value = item.notes || '';

        const checkRet = document.getElementById('venta-has-retention');
        const boxRet = document.getElementById('venta-retention-box');
        checkRet.checked = item.has_retention || false;
        
        if (item.has_retention) {
            boxRet.classList.add('active');
            const pctVal = item.retention_pct === 75 || item.retention_pct === 100 ? item.retention_pct.toString() : 'otro';
            document.getElementById('venta-retention-pct').value = pctVal;
            if (pctVal === 'otro') {
                document.getElementById('venta-ret-pct-custom-group').style.display = 'block';
                document.getElementById('venta-retention-pct-custom').value = item.retention_pct;
            } else {
                document.getElementById('venta-ret-pct-custom-group').style.display = 'none';
            }
            document.getElementById('venta-retention-amount').value = item.retention_amount || '';
            document.getElementById('venta-retention-number').value = item.retention_number || '';
            document.getElementById('venta-retention-date').value = item.retention_date || '';
            document.getElementById('venta-iva-percibido-comprador').value = item.iva_percibido_comprador || '';
        } else {
            boxRet.classList.remove('active');
            document.getElementById('venta-ret-pct-custom-group').style.display = 'none';
            document.getElementById('venta-iva-percibido-comprador').value = '';
        }

        const isFiscal = !!(item.fiscal_machine || item.control_z);
        document.getElementById('venta-is-fiscal-printer').checked = isFiscal;
        const boxFiscal = document.getElementById('venta-fiscal-printer-box');
        if (isFiscal) {
            boxFiscal.classList.add('active');
            document.getElementById('venta-fiscal-machine').value = item.fiscal_machine || '';
            document.getElementById('venta-control-z').value = item.control_z || '';
        } else {
            boxFiscal.classList.remove('active');
            document.getElementById('venta-fiscal-machine').value = '';
            document.getElementById('venta-control-z').value = '';
        }

        const isTerceros = !!(item.ventas_terceros_total || item.ventas_terceros_exentas || item.ventas_terceros_gravadas);
        document.getElementById('venta-is-terceros').checked = isTerceros;
        const boxTerceros = document.getElementById('venta-terceros-box');
        if (isTerceros) {
            boxTerceros.classList.add('active');
            document.getElementById('venta-terceros-total').value = item.ventas_terceros_total || '';
            document.getElementById('venta-terceros-exentas').value = item.ventas_terceros_exentas || '';
            document.getElementById('venta-terceros-gravadas').value = item.ventas_terceros_gravadas || '';
        } else {
            boxTerceros.classList.remove('active');
            document.getElementById('venta-terceros-total').value = '';
            document.getElementById('venta-terceros-exentas').value = '';
            document.getElementById('venta-terceros-gravadas').value = '';
        }

        if (window.toggleVentaNotasFields) window.toggleVentaNotasFields();
        if (window.toggleVentaExportFields) window.toggleVentaExportFields();

        document.getElementById('modal-venta-title').innerText = 'Modificar Factura de Venta';
        document.getElementById('modal-venta').classList.add('active');
    }
}

window.eliminarTransaccion = function(tipo, id) {
    const libro = tipo === 'compra' ? 'compras' : 'ventas';
    if (confirm('¿Deseas eliminar este registro fiscal?')) {
        state[libro] = state[libro].filter(item => item.id !== id);
        guardarDatos();
        renderAll();
        mostrarNotificacion('Registro fiscal eliminado del libro.', 'success');
    }
}

window.editarContacto = editarContacto;
window.eliminarContacto = eliminarContacto;

// --- REPORTE CONSOLIDADO: FORMA 30 SENIAT ---

function generarForma30SENIAT() {
    const inputMes = document.getElementById('reporte-mes-select');
    const inputPeriodo = document.getElementById('reporte-periodo-select');

    const mesStr = inputMes.value || new Date().toISOString().substring(0, 7);
    const periodo = inputPeriodo.value || 'completo';

    // Rellenar cabecera Forma 30
    document.getElementById('report-header-empresa').innerText = state.config.empresaName || 'Contribuyente sin Nombre';
    document.getElementById('report-header-rut').innerText = state.config.empresaRut || 'J-00000000-0';
    document.getElementById('report-header-contribuyente-tipo').innerText = state.config.empresaContribuyente === 'especial' 
        ? 'CONTRIBUYENTE ESPECIAL (Agente de Retención)' 
        : 'CONTRIBUYENTE ORDINARIO';

    let labelPeriodo = formatearMesNombre(mesStr).toUpperCase();
    if (periodo === 'q1') labelPeriodo += ' - 1RA QUINCENA (Días 01 al 15)';
    else if (periodo === 'q2') labelPeriodo += ' - 2DA QUINCENA (Días 16 al fin)';
    document.getElementById('report-period-title').innerText = labelPeriodo;

    // Campos del comprobante oficial (Certificado y Fecha)
    const certNumber = "99030" + mesStr.replace('-', '') + (periodo === 'q1' ? '1' : (periodo === 'q2' ? '2' : '0')) + "7412";
    document.getElementById('report-certificado-num').innerText = certNumber;
    
    const now = new Date();
    const dateFormatted = now.toLocaleDateString('es-VE') + ' ' + now.toLocaleTimeString('es-VE');
    document.getElementById('report-presentacion-fecha').innerText = dateFormatted;

    // --- FILTRADO DE TRANSACCIONES ---
    const filterFunc = (item) => {
        const matchMes = item.date.startsWith(mesStr);
        const matchPeriodo = checkFiltroQuincena(item.date, periodo);
        return matchMes && matchPeriodo;
    };

    const comprasPeriodo = state.compras.filter(filterFunc);
    const ventasPeriodo = state.ventas.filter(filterFunc);

    // --- CÁLCULO DÉBITOS FISCALES (VENTAS) ---
    let vExentaBase = 0;
    let vExportBase = 0;
    let vGenBase = 0; let vGenTax = 0;
    let vRedBase = 0; let vRedTax = 0;
    let vAdicBase = 0; let vAdicTax = 0;

    ventasPeriodo.forEach(v => {
        if (v.is_import_export) {
            // Ventas de exportación (exentas de IVA pero declaradas aparte en Casilla 23)
            vExportBase += v.total_amount || 0;
        } else {
            vExentaBase += v.base_exenta || 0;
            vGenBase += v.base_general || 0; vGenTax += v.tax_general || 0;
            vRedBase += v.base_reducida || 0; vRedTax += v.tax_reducida || 0;
            vAdicBase += v.base_adicional || 0; vAdicTax += v.tax_adicional || 0;
        }
    });

    const vTotalBase = vExentaBase + vExportBase + vGenBase + vRedBase + vAdicBase;
    const vTotalTax = vGenTax + vRedTax + vAdicTax;

    // Cargar ajustes del periodo
    const active = getActiveBeneficiary();
    if (!active.ajustes) active.ajustes = [];
    let ajuste = active.ajustes.find(a => a.period === mesStr && a.quincena === periodo);
    if (!ajuste) {
        ajuste = {
            period: mesStr,
            quincena: periodo,
            debito_ajuste: 0,
            debito_exonerado: 0,
            credito_ajuste: 0,
            excedente_anterior: 0,
            credito_ajuste_tax: 0
        };
        active.ajustes.push(ajuste);
    }

    // Set values in inputs
    document.getElementById('f30-v-ajuste-tax').value = ajuste.debito_ajuste || 0;
    document.getElementById('f30-v-exonerado-tax').value = ajuste.debito_exonerado || 0;
    document.getElementById('f30-c-excedente-anterior').value = ajuste.excedente_anterior || 0;
    document.getElementById('f30-c-ajuste-tax').value = ajuste.credito_ajuste_tax || 0;

    // Escribir Débitos en F30
    document.getElementById('f30-v-exenta-base').innerText = formatearMonedaF30(vExentaBase);
    document.getElementById('f30-v-export-base').innerText = formatearMonedaF30(vExportBase);
    document.getElementById('f30-v-general-base').innerText = formatearMonedaF30(vGenBase);
    document.getElementById('f30-v-general-tax').innerText = formatearMonedaF30(vGenTax);
    document.getElementById('f30-v-adicional-base').innerText = formatearMonedaF30(vAdicBase);
    document.getElementById('f30-v-adicional-tax').innerText = formatearMonedaF30(vAdicTax);
    document.getElementById('f30-v-reducida-base').innerText = formatearMonedaF30(vRedBase);
    document.getElementById('f30-v-reducida-tax').innerText = formatearMonedaF30(vRedTax);
    
    document.getElementById('f30-v-total-base').innerText = formatearMonedaF30(vTotalBase);
    document.getElementById('f30-v-total-tax').innerText = formatearMonedaF30(vTotalTax);

    // TOTAL FINAL DE DÉBITOS FISCALES (Casilla 49)
    const debitoAjusteVal = parseFloat(ajuste.debito_ajuste) || 0;
    const debitoExoneradoVal = parseFloat(ajuste.debito_exonerado) || 0;
    const vTotalFinalTax = Math.max(0, vTotalTax + debitoAjusteVal - debitoExoneradoVal);
    document.getElementById('f30-v-total-final-tax').innerText = formatearMonedaF30(vTotalFinalTax);

    // --- CÁLCULO CRÉDITOS FISCALES (COMPRAS) ---
    let cExentaBase = 0;
    let cImportExentaBase = 0;
    let cGenBase = 0; let cGenTax = 0;
    let cImportGenBase = 0; let cImportGenTax = 0;
    let cAdicBase = 0; let cAdicTax = 0;
    let cImportAdicBase = 0; let cImportAdicTax = 0;
    let cRedBase = 0; let cRedTax = 0;
    let cImportRedBase = 0; let cImportRedTax = 0;

    comprasPeriodo.forEach(c => {
        if (c.is_import_export) {
            cImportExentaBase += (c.base_exenta || 0) + (c.sin_credito || 0);
            cImportGenBase += c.base_general || 0; cImportGenTax += c.tax_general || 0;
            cImportRedBase += c.base_reducida || 0; cImportRedTax += c.tax_reducida || 0;
            cImportAdicBase += c.base_adicional || 0; cImportAdicTax += c.tax_adicional || 0;
        } else {
            cExentaBase += (c.base_exenta || 0) + (c.sin_credito || 0);
            cGenBase += c.base_general || 0; cGenTax += c.tax_general || 0;
            cRedBase += c.base_reducida || 0; cRedTax += c.tax_reducida || 0;
            cAdicBase += c.base_adicional || 0; cAdicTax += c.tax_adicional || 0;
        }
    });

    const cTotalBase = cExentaBase + cImportExentaBase + cGenBase + cImportGenBase + cRedBase + cImportRedBase + cAdicBase + cImportAdicBase;
    const cTotalTax = cGenTax + cImportGenTax + cRedTax + cImportRedTax + cAdicTax + cImportAdicTax;

    // Escribir Créditos en F30
    document.getElementById('f30-c-exenta-base').innerText = formatearMonedaF30(cExentaBase + cImportExentaBase);
    document.getElementById('f30-c-import-general-base').innerText = formatearMonedaF30(cImportGenBase);
    document.getElementById('f30-c-import-general-tax').innerText = formatearMonedaF30(cImportGenTax);
    document.getElementById('f30-c-import-adicional-base').innerText = formatearMonedaF30(cImportAdicBase);
    document.getElementById('f30-c-import-adicional-tax').innerText = formatearMonedaF30(cImportAdicTax);
    document.getElementById('f30-c-import-reducida-base').innerText = formatearMonedaF30(cImportRedBase);
    document.getElementById('f30-c-import-reducida-tax').innerText = formatearMonedaF30(cImportRedTax);

    document.getElementById('f30-c-general-base').innerText = formatearMonedaF30(cGenBase);
    document.getElementById('f30-c-general-tax').innerText = formatearMonedaF30(cGenTax);
    document.getElementById('f30-c-adicional-base').innerText = formatearMonedaF30(cAdicBase);
    document.getElementById('f30-c-adicional-tax').innerText = formatearMonedaF30(cAdicTax);
    document.getElementById('f30-c-reducida-base').innerText = formatearMonedaF30(cRedBase);
    document.getElementById('f30-c-reducida-tax').innerText = formatearMonedaF30(cRedTax);

    document.getElementById('f30-c-total-base').innerText = formatearMonedaF30(cTotalBase);
    document.getElementById('f30-c-total-tax').innerText = formatearMonedaF30(cTotalTax);

    // Deducibles
    document.getElementById('f30-c-deducibles-tax').innerText = formatearMonedaF30(cTotalTax);
    document.getElementById('f30-c-prorata-tax').innerText = '0,00';
    document.getElementById('f30-c-total-deducibles-tax').innerText = formatearMonedaF30(cTotalTax);

    // Ajustes créditos
    document.getElementById('f30-c-reintegro-exportadores-tax').innerText = '0,00';
    document.getElementById('f30-c-reintegro-exonerados-tax').innerText = '0,00';
    document.getElementById('f30-c-certificados-emitidos-tax').innerText = '0,00';

    const excedenteAnteriorVal = parseFloat(ajuste.excedente_anterior) || 0;
    const creditoAjusteTaxVal = parseFloat(ajuste.credito_ajuste_tax) || 0;

    // Casilla 39: Total Créditos Fiscales (71 + 20 - 21 - 81 +/- 38 - 82)
    const cTotalFinalTax = Math.max(0, cTotalTax + excedenteAnteriorVal + creditoAjusteTaxVal);
    document.getElementById('f30-c-total-final-tax').innerText = formatearMonedaF30(cTotalFinalTax);

    // --- AUTOLIQUIDACIÓN (PÁGINA 2) ---
    let totalCuotaTributaria = 0; // Casilla 53
    let excedenteMesSiguiente = 0; // Casilla 60

    const diff = vTotalFinalTax - cTotalFinalTax;
    if (diff > 0) {
        totalCuotaTributaria = diff;
    } else {
        excedenteMesSiguiente = Math.abs(diff);
    }

    document.getElementById('f30-v-total-cuota').innerText = formatearMonedaF30(totalCuotaTributaria);
    document.getElementById('f30-v-excedente-mes-siguiente').innerText = formatearMonedaF30(excedenteMesSiguiente);

    // Casillas 22, 51, 24
    document.getElementById('f30-impuesto-pagado-sustituida').innerText = '0,00';
    document.getElementById('f30-v-retenciones-sustituida').innerText = '0,00';
    document.getElementById('f30-v-percepciones-sustituida').innerText = '0,00';

    // Casilla 78: Sub-total impuesto
    const subtotalImpuestoPagar = totalCuotaTributaria;
    document.getElementById('f30-v-subtotal-impuesto').innerText = formatearMonedaF30(subtotalImpuestoPagar);

    // --- RETENCIONES ---
    const retencionesAcumuladasVal = parseFloat(state.config.retencionesAnteriores) || 0;
    document.getElementById('f30-retenciones-acumuladas').innerText = formatearMonedaF30(retencionesAcumuladasVal);

    const retencionesPeriodoVal = ventasPeriodo.reduce((acc, curr) => acc + (curr.retention_amount || 0), 0);
    document.getElementById('f30-retenciones-periodo').innerText = formatearMonedaF30(retencionesPeriodoVal);

    // Casillas 72, 73
    document.getElementById('f30-retenciones-cesiones').innerText = '0,00';
    document.getElementById('f30-retenciones-recuperaciones').innerText = '0,00';

    // Casilla 74: Total Retenciones
    const totalRetencionesVal = retencionesAcumuladasVal + retencionesPeriodoVal;
    document.getElementById('f30-total-retenciones').innerText = formatearMonedaF30(totalRetencionesVal);

    // Casilla 55: Retenciones Descontadas
    const retencionesDescontadasVal = Math.min(subtotalImpuestoPagar, totalRetencionesVal);
    document.getElementById('f30-retenciones-descontadas').innerText = formatearMonedaF30(retencionesDescontadasVal);

    // Casilla 67: Saldo Retenciones no Aplicado
    const saldoRetencionesNoAplicadoVal = totalRetencionesVal - retencionesDescontadasVal;
    document.getElementById('f30-retenciones-saldo-no-aplicado').innerText = formatearMonedaF30(saldoRetencionesNoAplicadoVal);

    // Casilla 56: Sub-Total Impuesto a Pagar (78-55)
    const subtotalDespuesRetencionesVal = subtotalImpuestoPagar - retencionesDescontadasVal;
    document.getElementById('f30-subtotal-impuesto-despues-retenciones').innerText = formatearMonedaF30(subtotalDespuesRetencionesVal);

    // --- PERCEPCIONES ---
    // Casillas 57, 75, 76
    document.getElementById('f30-percepciones-acumuladas-import').innerText = '0,00';
    document.getElementById('f30-percepciones-cesiones').innerText = '0,00';
    document.getElementById('f30-percepciones-recuperacion').innerText = '0,00';

    // Casilla 68: Percepciones del Periodo (iva_percibido_aduana de compras + iva_percibido_comprador de ventas)
    const percepcionesAduanaCompras = comprasPeriodo.reduce((acc, curr) => acc + (curr.iva_percibido_aduana || 0), 0);
    const percepcionesCompradorVentas = ventasPeriodo.reduce((acc, curr) => acc + (curr.iva_percibido_comprador || 0), 0);
    const percepcionesPeriodoVal = percepcionesAduanaCompras + percepcionesCompradorVentas;
    document.getElementById('f30-percepciones-periodo').innerText = formatearMonedaF30(percepcionesPeriodoVal);

    // Casilla 77: Total Percepciones
    const totalPercepcionesVal = percepcionesPeriodoVal;
    document.getElementById('f30-total-percepciones').innerText = formatearMonedaF30(totalPercepcionesVal);

    // Casilla 58: Percepciones descontadas
    const percepcionesDescontadasVal = Math.min(subtotalDespuesRetencionesVal, totalPercepcionesVal);
    document.getElementById('f30-percepciones-descontadas').innerText = formatearMonedaF30(percepcionesDescontadasVal);

    // Casilla 69: Saldo Percepciones no Aplicado
    const saldoPercepcionesNoAplicadoVal = totalPercepcionesVal - percepcionesDescontadasVal;
    document.getElementById('f30-percepciones-saldo-no-aplicado').innerText = formatearMonedaF30(saldoPercepcionesNoAplicadoVal);

    // Casilla 90: TOTAL A PAGAR (56-58)
    const totalPagarFinalVal = subtotalDespuesRetencionesVal - percepcionesDescontadasVal;
    document.getElementById('f30-total-pagar-final').innerText = formatearMonedaF30(totalPagarFinalVal);

    console.log(`Cierre IVA SENIAT Completo: Débitos ${vTotalFinalTax} - Créditos ${cTotalFinalTax} = Neto ${diff}. Pagar Final: ${totalPagarFinalVal}`);
}

function updateF30Ajuste(field, val) {
    const inputMes = document.getElementById('reporte-mes-select');
    const inputPeriodo = document.getElementById('reporte-periodo-select');
    const mesStr = inputMes.value || new Date().toISOString().substring(0, 7);
    const periodo = inputPeriodo.value || 'completo';

    const active = getActiveBeneficiary();
    if (!active.ajustes) active.ajustes = [];
    
    let ajuste = active.ajustes.find(a => a.period === mesStr && a.quincena === periodo);
    if (!ajuste) {
        ajuste = {
            period: mesStr,
            quincena: periodo,
            debito_ajuste: 0,
            debito_exonerado: 0,
            credito_ajuste: 0,
            excedente_anterior: 0,
            credito_ajuste_tax: 0
        };
        active.ajustes.push(ajuste);
    }
    
    ajuste[field] = val;
    
    // Recalcular
    generarForma30SENIAT();
    
    // Guardar en base de datos
    guardarDatos();
}

// Botones de ejecución en reporte
document.getElementById('btn-cargar-reporte').addEventListener('click', generarForma30SENIAT);
document.getElementById('btn-imprimir-reporte').addEventListener('click', () => {
    window.print();
});

// --- EXPORTACIÓN DE LIBROS EN EXCEL (CSV VENEZOLANO) ---

document.getElementById('btn-csv-compras').addEventListener('click', () => {
    exportarCSVVenezia('compras');
});
document.getElementById('btn-csv-ventas').addEventListener('click', () => {
    exportarCSVVenezia('ventas');
});

function exportarCSVVenezia(tipo) {
    const datos = tipo === 'compras' ? state.compras : state.ventas;
    if (datos.length === 0) {
        mostrarNotificacion(`El libro fiscal de ${tipo} está vacío. Nada que exportar.`, 'warning');
        return;
    }

    let csv = '\uFEFF'; // BOM para compatibilidad con Excel

    if (tipo === 'compras') {
        // Libro de Compras venezolano oficial detallado
        csv += 'Oper. N°;Fecha Factura;RIF Proveedor;Razon Social Proveedor;Planilla Exportacion Forma D;Expediente Importacion;N° Factura;N° Control;N° Nota Debito;N° Nota Credito;Factura Afectada;Total Compras con IVA;Sin Derecho Credito Fiscal;Base Imponible General (16%);Alicuota General (16%);Monto IVA General (16%);Base Reducida (8%);Alicuota Reducida (8%);Monto IVA Reducido (8%);Base Adicional (31%);Alicuota Adicional (31%);Monto IVA Adicional (31%);IVA Retenido al Vendedor;IVA Retenido a Terceros;IVA Percibido por Aduana;N° Comprobante Retencion;Fecha Comprobante Retencion;Clasificacion\r\n';
        
        datos.forEach((d, idx) => {
            const contact = state.contactos.find(c => c.id === d.contact_id);
            const rif = contact ? contact.tax_id : '';
            const nombre = contact ? contact.name : '';
            const territorial = d.is_import_export ? 'IMPORTACION' : 'NACIONAL';
            
            csv += `${idx + 1};${d.date};${rif};"${nombre.replace(/"/g, '""')}";${d.export_form_d || ''};${d.import_expediente || ''};${d.doc_type === 'Factura' ? d.doc_number : ''};${d.control_number || ''};${d.nota_debito || ''};${d.nota_credito || ''};${d.doc_afectado || ''};${d.total_amount};${d.sin_credito || 0};${d.base_general || 0};16%;${d.tax_general || 0};${d.base_reducida || 0};8%;${d.tax_reducida || 0};${d.base_adicional || 0};31%;${d.tax_adicional || 0};${d.has_retention ? d.retention_amount : 0};${d.retencion_terceros || 0};${d.iva_percibido_aduana || 0};${d.retention_number || ''};${d.retention_date || ''};${territorial}\r\n`;
        });
    } else {
        // Libro de Ventas venezolano oficial detallado
        csv += 'Oper. N°;Fecha Factura;RIF Cliente;Razon Social Cliente;Maquina Fiscal;Control Z;Planilla Exportacion Forma D;N° Factura;N° Control;N° Nota Debito;N° Nota Credito;Factura Afectada;N° Comprobante Retencion;Total Ventas con IVA;Ventas Exentas;Ventas Exportacion;Base Imponible General (16%);Alicuota General (16%);Monto IVA General (16%);Base Reducida (8%);Alicuota Reducida (8%);Monto IVA Reducido (8%);Base Adicional (31%);Alicuota Adicional (31%);Monto IVA Adicional (31%);IVA Retenido por Comprador;IVA Percibido por Comprador;Ventas Terceros Total;Ventas Terceros Exentas;Ventas Terceros Gravadas;Clasificacion\r\n';
        
        datos.forEach((d, idx) => {
            const contact = state.contactos.find(c => c.id === d.contact_id);
            const rif = contact ? contact.tax_id : '';
            const nombre = contact ? contact.name : '';
            const exportVal = d.is_import_export ? d.total_amount : 0;
            const exentaVal = d.is_import_export ? 0 : (d.base_exenta || 0);
            const territorial = d.is_import_export ? 'EXPORTACION' : 'NACIONAL';

            csv += `${idx + 1};${d.date};${rif};"${nombre.replace(/"/g, '""')}";${d.fiscal_machine || ''};${d.control_z || ''};${d.export_form_d || ''};${d.doc_type === 'Factura' ? d.doc_number : ''};${d.control_number || ''};${d.nota_debito || ''};${d.nota_credito || ''};${d.doc_afectado || ''};${d.retention_number || ''};${d.total_amount};${exentaVal};${exportVal};${d.base_general || 0};16%;${d.tax_general || 0};${d.base_reducida || 0};8%;${d.tax_reducida || 0};${d.base_adicional || 0};31%;${d.tax_adicional || 0};${d.has_retention ? d.retention_amount : 0};${d.iva_percibido_comprador || 0};${d.ventas_terceros_total || 0};${d.ventas_terceros_exentas || 0};${d.ventas_terceros_gravadas || 0};${territorial}\r\n`;
        });
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `libro_${tipo}_fiscal_${new Date().toISOString().substring(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    mostrarNotificacion(`Libro fiscal de ${tipo} exportado a CSV con éxito.`, 'success');
}

// --- RESPALDOS JSON ---

function exportarJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `respaldo_fiscal_SENIAT_${new Date().toISOString().substring(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    mostrarNotificacion('Respaldo contable JSON exportado.', 'success');
}

function importarJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const parsed = JSON.parse(event.target.result);
            if ((parsed.compras && parsed.ventas && parsed.contactos) || (parsed.beneficiarios && parsed.activeBeneficiaryId)) {
                if (!parsed.beneficiarios) {
                    const oldBeneficiary = {
                        id: Date.now(),
                        name: (parsed.config && parsed.config.empresaName) || 'Mi Empresa C.A.',
                        tax_id: (parsed.config && parsed.config.empresaRut) || 'J-12345678-9',
                        especial: (parsed.config && parsed.config.empresaContribuyente === 'especial') ? 'si' : 'no',
                        retencionesAnteriores: (parsed.config && parsed.config.retencionesAnteriores) || 0,
                        compras: parsed.compras || [],
                        ventas: parsed.ventas || [],
                        contactos: parsed.contactos || []
                    };
                    parsed.beneficiarios = [oldBeneficiary];
                    parsed.activeBeneficiaryId = oldBeneficiary.id;
                    delete parsed.compras;
                    delete parsed.ventas;
                    delete parsed.contactos;
                }
                
                state = parsed;
                const active = state.beneficiarios.find(b => b.id === state.activeBeneficiaryId) || state.beneficiarios[0];
                state.compras = active.compras || [];
                state.ventas = active.ventas || [];
                state.contactos = active.contactos || [];
                
                if (!state.config) state.config = { ivaRate: 16, theme: 'dark' };
                state.config.empresaName = active.name;
                state.config.empresaRut = active.tax_id;
                state.config.empresaContribuyente = active.especial === 'si' ? 'especial' : 'ordinario';
                state.config.retencionesAnteriores = active.retencionesAnteriores || 0;

                guardarDatos();
                renderAll();
                mostrarNotificacion('Copia de seguridad contable importada.', 'success');
            } else {
                mostrarNotificacion('Archivo JSON inválido. Estructura contable incorrecta.', 'danger');
            }
        } catch (error) {
            console.error(error);
            mostrarNotificacion('Error leyendo el archivo JSON.', 'danger');
        }
    };
    reader.readAsText(file);
    e.target.value = "";
}

function actualizarIndicadorBaseDatos(enlazado, nombreArchivo = '') {
    const dot = document.getElementById('db-status-dot');
    const label = document.getElementById('db-status-label');
    
    if (enlazado) {
        dot.className = 'status-dot';
        label.innerHTML = `Sincronizado: <strong style="color:var(--text-primary); font-size:0.75rem;">${nombreArchivo}</strong>`;
    } else {
        dot.className = 'status-dot unsaved';
        label.innerText = 'Guardado Local (Navegador)';
    }
}

// --- UTILIDADES ---

function formatearMoneda(val) {
    return new Intl.NumberFormat('es-VE', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(val) + ' Bs.';
}

function formatearMonedaF30(val) {
    return new Intl.NumberFormat('es-VE', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(val);
}

function formatearFechaISOaUI(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatearMesNombre(mesStr) {
    if (!mesStr) return '';
    const [anio, mes] = mesStr.split('-');
    const nombresMeses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const index = parseInt(mes, 10) - 1;
    return `${nombresMeses[index]} ${anio}`;
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    
    let icon = '';
    if (tipo === 'success') {
        icon = '<svg style="width:20px;height:20px;stroke:var(--color-success);stroke-width:2;fill:none;" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3"/></svg>';
    } else if (tipo === 'danger') {
        icon = '<svg style="width:20px;height:20px;stroke:var(--color-danger);stroke-width:2;fill:none;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6m0-6 6 6"/></svg>';
    } else if (tipo === 'warning') {
        icon = '<svg style="width:20px;height:20px;stroke:var(--color-warning);stroke-width:2;fill:none;" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4m0 4h.01"/></svg>';
    } else {
        icon = '<svg style="width:20px;height:20px;stroke:var(--color-info);stroke-width:2;fill:none;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>';
    }

    toast.innerHTML = `${icon}<span>${mensaje}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'opacity 0.4s, transform 0.4s';
        setTimeout(() => toast.remove(), 400);
    }, 4500);
}

// --- LOGICA DE BENEFICIARIOS ---

function renderSelectoresBeneficiarios() {
    const activeId = state.activeBeneficiaryId;
    const selectEl = document.getElementById('select-beneficiario-activo');
    if (!selectEl) return;
    
    let html = '';
    state.beneficiarios.forEach(b => {
        html += `<option value="${b.id}" ${b.id === activeId ? 'selected' : ''}>${b.tax_id} | ${b.name}</option>`;
    });
    selectEl.innerHTML = html;
}

function renderTablaBeneficiarios(filtrados = null) {
    const tbody = document.getElementById('tabla-beneficiarios-body');
    if (!tbody) return;

    const datos = filtrados || state.beneficiarios;
    if (!datos || datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay beneficiarios registrados.</td></tr>';
        return;
    }

    const ordenados = [...datos].sort((a, b) => a.name.localeCompare(b.name));
    let html = '';
    ordenados.forEach(b => {
        const isActivo = b.id === state.activeBeneficiaryId;
        const rowClass = isActivo ? 'style="background-color: var(--color-primary-glow); font-weight: 500;"' : '';
        const tipoBadge = b.especial === 'si' ? '<span class="badge badge-success">ESPECIAL</span>' : '<span class="badge badge-warning">ORDINARIO</span>';
        
        html += `
            <tr ${rowClass}>
                <td><span class="font-semibold">${b.tax_id}</span></td>
                <td><span class="font-semibold">${b.name} ${isActivo ? ' <span class="badge badge-success" style="font-size: 0.6rem; padding: 2px 6px; text-transform:none;">Activo</span>' : ''}</span></td>
                <td>${tipoBadge}</td>
                <td class="text-right">${formatearMoneda(b.retencionesAnteriores || 0)}</td>
                <td class="text-center">
                    <div class="flex gap-8 justify-center">
                        ${!isActivo ? `
                            <button class="btn btn-success" style="font-size:0.75rem; padding: 6px 12px;" onclick="seleccionarBeneficiario(${b.id})" title="Seleccionar Beneficiario">
                                Seleccionar
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary btn-icon-only" onclick="editarBeneficiario(${b.id})" title="Editar">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                        </button>
                        <button class="btn btn-danger btn-icon-only" onclick="eliminarBeneficiario(${b.id})" title="Eliminar">
                            <svg viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6m4-16v16"/></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function filtrarBeneficiarios() {
    const query = document.getElementById('buscar-beneficiarios').value.toLowerCase();
    const filtrados = state.beneficiarios.filter(b => {
        return b.name.toLowerCase().includes(query) || b.tax_id.toLowerCase().includes(query);
    });
    renderTablaBeneficiarios(filtrados);
}

function abrirModalBeneficiario() {
    document.getElementById('form-beneficiario').reset();
    document.getElementById('beneficiario-id').value = '';
    if (document.getElementById('beneficiario-documento-tipo')) {
        document.getElementById('beneficiario-documento-tipo').value = 'RIF';
    }
    document.getElementById('modal-beneficiario-title').innerText = 'Registrar Beneficiario';
    document.getElementById('modal-beneficiario').classList.add('active');
}

function cerrarModalBeneficiario() {
    document.getElementById('modal-beneficiario').classList.remove('active');
}

document.getElementById('form-beneficiario').addEventListener('submit', (e) => {
    e.preventDefault();
    const idVal = document.getElementById('beneficiario-id').value;
    const name = document.getElementById('beneficiario-name').value.trim();
    const taxId = document.getElementById('beneficiario-tax-id').value.trim().toUpperCase();
    const especial = document.getElementById('beneficiario-especial').value;
    const retenciones = parseFloat(document.getElementById('beneficiario-retenciones').value) || 0;

    if (!name || !taxId) {
        mostrarNotificacion('Nombre y RIF son obligatorios.', 'warning');
        return;
    }

    if (idVal) {
        // Editar existente
        const id = parseInt(idVal);
        const idx = state.beneficiarios.findIndex(b => b.id === id);
        if (idx !== -1) {
            state.beneficiarios[idx].name = name;
            state.beneficiarios[idx].tax_id = taxId;
            state.beneficiarios[idx].especial = especial;
            state.beneficiarios[idx].retencionesAnteriores = retenciones;
            
            // Si es el beneficiario activo, actualizar variables montadas
            if (state.activeBeneficiaryId === id) {
                state.config.empresaName = name;
                state.config.empresaRut = taxId;
                state.config.empresaContribuyente = especial === 'si' ? 'especial' : 'ordinario';
                state.config.retencionesAnteriores = retenciones;
            }
            mostrarNotificacion('Beneficiario actualizado con éxito.', 'success');
        }
    } else {
        // Crear nuevo
        const nuevoId = state.beneficiarios.length > 0 ? Math.max(...state.beneficiarios.map(b => b.id)) + 1 : 1;
        const nuevoBeneficiario = {
            id: nuevoId,
            name,
            tax_id: taxId,
            especial,
            retencionesAnteriores: retenciones,
            compras: [],
            ventas: [],
            contactos: []
        };
        state.beneficiarios.push(nuevoBeneficiario);
        mostrarNotificacion('Nuevo beneficiario registrado con éxito.', 'success');
        
        // Auto-seleccionar si es el único
        if (state.beneficiarios.length === 1) {
            seleccionarBeneficiario(nuevoId);
        }
    }

    guardarDatos();
    renderAll();
    cerrarModalBeneficiario();
});

function editarBeneficiario(id) {
    const b = state.beneficiarios.find(item => item.id === id);
    if (!b) return;

    document.getElementById('beneficiario-id').value = b.id;
    document.getElementById('beneficiario-name').value = b.name;
    if (document.getElementById('beneficiario-documento-tipo')) {
        document.getElementById('beneficiario-documento-tipo').value = determinarTipoDoc(b.tax_id);
    }
    document.getElementById('beneficiario-tax-id').value = b.tax_id;
    document.getElementById('beneficiario-especial').value = b.especial || 'no';
    document.getElementById('beneficiario-retenciones').value = b.retencionesAnteriores || 0;

    document.getElementById('modal-beneficiario-title').innerText = 'Modificar Beneficiario';
    document.getElementById('modal-beneficiario').classList.add('active');
}

function eliminarBeneficiario(id) {
    if (state.beneficiarios.length <= 1) {
        mostrarNotificacion('No se puede eliminar el único beneficiario existente. Debe haber al menos uno.', 'warning');
        return;
    }

    const b = state.beneficiarios.find(item => item.id === id);
    if (!b) return;

    if (confirm(`¿Deseas eliminar al beneficiario "${b.name}"?\n\n¡Advertencia! Se borrarán permanentemente todos sus libros de compras, ventas y contactos.`)) {
        state.beneficiarios = state.beneficiarios.filter(item => item.id !== id);
        
        // Si eliminamos el activo, alternar al primero disponible
        if (state.activeBeneficiaryId === id) {
            state.activeBeneficiaryId = state.beneficiarios[0].id;
            const active = state.beneficiarios[0];
            state.compras = active.compras || [];
            state.ventas = active.ventas || [];
            state.contactos = active.contactos || [];
            state.config.empresaName = active.name;
            state.config.empresaRut = active.tax_id;
            state.config.empresaContribuyente = active.especial === 'si' ? 'especial' : 'ordinario';
            state.config.retencionesAnteriores = active.retencionesAnteriores || 0;
        }

        guardarDatos();
        renderAll();
        mostrarNotificacion('Beneficiario eliminado con éxito.', 'success');
    }
}

// =======================================================
// EXPONER FUNCIONES AL ENTORNO GLOBAL (window)
// Necesario porque el HTML usa atributos onclick="..."
// =======================================================

// Modales de Compras
window.abrirModalCompra = abrirModalCompra;
window.cerrarModalCompra = cerrarModalCompra;

// Modales de Ventas
window.abrirModalVenta = abrirModalVenta;
window.cerrarModalVenta = cerrarModalVenta;

// Modales de Contactos
window.abrirModalContacto = abrirModalContacto;
window.cerrarModalContacto = cerrarModalContacto;

// Beneficiarios
window.seleccionarBeneficiario = seleccionarBeneficiario;
window.abrirModalBeneficiario = abrirModalBeneficiario;
window.cerrarModalBeneficiario = cerrarModalBeneficiario;
window.editarBeneficiario = editarBeneficiario;
window.eliminarBeneficiario = eliminarBeneficiario;

function aplicarFormatoRif(e) {
    const input = e.target;
    
    // Auto-detectar si empieza por J, G, C para forzar R.I.F.
    const clean = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (clean.length > 0) {
        const firstChar = clean.charAt(0);
        if (/^[JGC]$/.test(firstChar)) {
            const selectId = (input.id === 'contacto-tax-id') ? 'contacto-documento-tipo' : 'beneficiario-documento-tipo';
            const selectEl = document.getElementById(selectId);
            if (selectEl && selectEl.value !== 'RIF') {
                selectEl.value = 'RIF';
            }
        }
    }

    if (e.inputType && e.inputType.startsWith('delete')) {
        return; // Permitir borrar guiones sin re-escribirlos
    }

    // Obtener tipo de documento seleccionado
    let tipoDoc = 'RIF';
    if (input.id === 'contacto-tax-id') {
        tipoDoc = document.getElementById('contacto-documento-tipo').value;
    } else if (input.id === 'beneficiario-tax-id') {
        tipoDoc = document.getElementById('beneficiario-documento-tipo').value;
    }

    const originalVal = input.value;
    const formatted = formatearRif(originalVal, tipoDoc);
    if (originalVal !== formatted) {
        input.value = formatted;
    }
}

function formatearRif(val, tipoDoc = 'RIF') {
    let clean = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (clean.length === 0) return '';
    
    let prefix = clean.charAt(0);
    let numbers = '';
    
    if (/^[VEJGPC]$/.test(prefix)) {
        numbers = clean.slice(1);
    } else {
        // Prefijo por defecto según el tipo de documento seleccionado
        prefix = (tipoDoc === 'CEDULA') ? 'V' : 'J';
        numbers = clean;
    }
    
    numbers = numbers.replace(/[^0-9]/g, '');
    
    if (numbers.length === 0) {
        return prefix + '-';
    }
    
    if (tipoDoc === 'CEDULA') {
        // Formato Cédula (V-12345678, sin guión final, máximo 8 números)
        return prefix + '-' + numbers.slice(0, 8);
    } else {
        // Formato RIF tradicional (J-12345678-9, 8 números + 1)
        if (numbers.length <= 8) {
            return prefix + '-' + numbers;
        } else {
            let base = numbers.slice(0, 8);
            let verifier = numbers.slice(8, 9);
            return prefix + '-' + base + '-' + verifier;
        }
    }
}

function determinarTipoDoc(taxId) {
    if (!taxId) return 'RIF';
    const clean = taxId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const prefix = clean.charAt(0);
    
    if (/^[JGC]$/.test(prefix)) {
        return 'RIF';
    }
    
    // Si tiene dos guiones en el formato o más de 8 números, es RIF
    const hasTwoHyphens = (taxId.match(/-/g) || []).length > 1;
    const digitsOnly = taxId.replace(/[^0-9]/g, '');
    if (hasTwoHyphens || digitsOnly.length > 8) {
        return 'RIF';
    }
    
    return 'CEDULA';
}

