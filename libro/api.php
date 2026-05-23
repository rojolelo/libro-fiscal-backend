<?php
/**
 * ==========================================================================
 * BACKEND API: PERSISTENCIA EN SQLite PARA LIBRO FISCAL (SENIAT - VENEZUELA)
 * ==========================================================================
 */

header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");

$dbFile = 'libro_fiscal.sqlite';

try {
    $pdo = new PDO("sqlite:" . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    
    // Configuración global de SQLite para concurrencia básica
    $pdo->exec("PRAGMA foreign_keys = ON");
    
    // Crear tablas si no existen
    $pdo->exec("CREATE TABLE IF NOT EXISTS config (
        theme TEXT DEFAULT 'dark',
        iva_rate REAL DEFAULT 16.0,
        active_beneficiary_id INTEGER
    )");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS beneficiarios (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        tax_id TEXT NOT NULL,
        especial TEXT DEFAULT 'no',
        retenciones_anteriores REAL DEFAULT 0.0
    )");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS contactos (
        id INTEGER,
        beneficiary_id INTEGER,
        tax_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        especial TEXT DEFAULT 'no',
        email TEXT,
        phone TEXT,
        address TEXT,
        PRIMARY KEY (id, beneficiary_id),
        FOREIGN KEY (beneficiary_id) REFERENCES beneficiarios(id) ON DELETE CASCADE
    )");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS compras (
        id INTEGER,
        beneficiary_id INTEGER,
        type TEXT NOT NULL,
        date TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        doc_afectado TEXT,
        doc_number TEXT NOT NULL,
        control_number TEXT NOT NULL,
        contact_id INTEGER NOT NULL,
        is_import_export INTEGER DEFAULT 0,
        base_exenta REAL DEFAULT 0.0,
        base_general REAL DEFAULT 0.0,
        tax_general REAL DEFAULT 0.0,
        base_reducida REAL DEFAULT 0.0,
        tax_reducida REAL DEFAULT 0.0,
        base_adicional REAL DEFAULT 0.0,
        tax_adicional REAL DEFAULT 0.0,
        net_amount REAL DEFAULT 0.0,
        tax_amount REAL DEFAULT 0.0,
        total_amount REAL DEFAULT 0.0,
        has_retention INTEGER DEFAULT 0,
        retention_pct REAL DEFAULT 0.0,
        retention_amount REAL DEFAULT 0.0,
        retention_number TEXT,
        retention_date TEXT,
        status TEXT DEFAULT 'Pagado',
        notes TEXT,
        export_form_d TEXT,
        import_expediente TEXT,
        nota_debito TEXT,
        nota_credito TEXT,
        sin_credito REAL DEFAULT 0.0,
        retencion_terceros REAL DEFAULT 0.0,
        iva_percibido_aduana REAL DEFAULT 0.0,
        PRIMARY KEY (id, beneficiary_id),
        FOREIGN KEY (beneficiary_id) REFERENCES beneficiarios(id) ON DELETE CASCADE
    )");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS ventas (
        id INTEGER,
        beneficiary_id INTEGER,
        type TEXT NOT NULL,
        date TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        doc_afectado TEXT,
        doc_number TEXT NOT NULL,
        control_number TEXT NOT NULL,
        contact_id INTEGER NOT NULL,
        is_import_export INTEGER DEFAULT 0,
        base_exenta REAL DEFAULT 0.0,
        base_general REAL DEFAULT 0.0,
        tax_general REAL DEFAULT 0.0,
        base_reducida REAL DEFAULT 0.0,
        tax_reducida REAL DEFAULT 0.0,
        base_adicional REAL DEFAULT 0.0,
        tax_adicional REAL DEFAULT 0.0,
        net_amount REAL DEFAULT 0.0,
        tax_amount REAL DEFAULT 0.0,
        total_amount REAL DEFAULT 0.0,
        has_retention INTEGER DEFAULT 0,
        retention_pct REAL DEFAULT 0.0,
        retention_amount REAL DEFAULT 0.0,
        retention_number TEXT,
        retention_date TEXT,
        status TEXT DEFAULT 'Pagado',
        notes TEXT,
        fiscal_machine TEXT,
        control_z TEXT,
        export_form_d TEXT,
        nota_debito TEXT,
        nota_credito TEXT,
        iva_percibido_comprador REAL DEFAULT 0.0,
        ventas_terceros_total REAL DEFAULT 0.0,
        ventas_terceros_exentas REAL DEFAULT 0.0,
        ventas_terceros_gravadas REAL DEFAULT 0.0,
        PRIMARY KEY (id, beneficiary_id),
        FOREIGN KEY (beneficiary_id) REFERENCES beneficiarios(id) ON DELETE CASCADE
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS ajustes_periodo (
        beneficiary_id INTEGER,
        period TEXT NOT NULL,
        quincena TEXT NOT NULL,
        debito_ajuste REAL DEFAULT 0.0,
        debito_exonerado REAL DEFAULT 0.0,
        credito_ajuste REAL DEFAULT 0.0,
        excedente_anterior REAL DEFAULT 0.0,
        credito_ajuste_tax REAL DEFAULT 0.0,
        PRIMARY KEY (beneficiary_id, period, quincena),
        FOREIGN KEY (beneficiary_id) REFERENCES beneficiarios(id) ON DELETE CASCADE
    )");

    $ajustesCols = [
        'excedente_anterior' => 'REAL DEFAULT 0.0',
        'credito_ajuste_tax' => 'REAL DEFAULT 0.0'
    ];
    foreach ($ajustesCols as $col => $type) {
        try {
            $pdo->exec("ALTER TABLE ajustes_periodo ADD COLUMN $col $type");
        } catch (PDOException $e) {
            // Ignorar si ya existe
        }
    }

    // Migraciones automáticas (ALTER TABLE) para bases de datos existentes
    $comprasCols = [
        'export_form_d' => 'TEXT',
        'import_expediente' => 'TEXT',
        'nota_debito' => 'TEXT',
        'nota_credito' => 'TEXT',
        'sin_credito' => 'REAL DEFAULT 0.0',
        'retencion_terceros' => 'REAL DEFAULT 0.0',
        'iva_percibido_aduana' => 'REAL DEFAULT 0.0'
    ];
    foreach ($comprasCols as $col => $type) {
        try {
            $pdo->exec("ALTER TABLE compras ADD COLUMN $col $type");
        } catch (PDOException $e) {
            // Ignorar si ya existe
        }
    }

    $ventasCols = [
        'fiscal_machine' => 'TEXT',
        'control_z' => 'TEXT',
        'export_form_d' => 'TEXT',
        'nota_debito' => 'TEXT',
        'nota_credito' => 'TEXT',
        'iva_percibido_comprador' => 'REAL DEFAULT 0.0',
        'ventas_terceros_total' => 'REAL DEFAULT 0.0',
        'ventas_terceros_exentas' => 'REAL DEFAULT 0.0',
        'ventas_terceros_gravadas' => 'REAL DEFAULT 0.0'
    ];
    foreach ($ventasCols as $col => $type) {
        try {
            $pdo->exec("ALTER TABLE ventas ADD COLUMN $col $type");
        } catch (PDOException $e) {
            // Ignorar si ya existe
        }
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo conectar o inicializar la base de datos SQLite: ' . $e->getMessage()]);
    exit;
}

$action = isset($_GET['action']) ? $_GET['action'] : '';

// 1. CARGAR DATOS DESDE SQLite
if ($action === 'load') {
    try {
        // Cargar config global
        $stmt = $pdo->query("SELECT * FROM config LIMIT 1");
        $configRow = $stmt->fetch();
        
        $config = [
            'ivaRate' => 16,
            'theme' => 'dark'
        ];
        $activeBeneficiaryId = null;
        
        if ($configRow) {
            $config['theme'] = $configRow['theme'];
            $config['ivaRate'] = (float)$configRow['iva_rate'];
            $activeBeneficiaryId = $configRow['active_beneficiary_id'] ? (int)$configRow['active_beneficiary_id'] : null;
        }
        
        // Cargar beneficiarios
        $stmt = $pdo->query("SELECT * FROM beneficiarios");
        $beneficiariosRows = $stmt->fetchAll();
        
        $beneficiarios = [];
        foreach ($beneficiariosRows as $bRow) {
            $bId = (int)$bRow['id'];
            
            // Cargar compras para este beneficiario
            $stmtC = $pdo->prepare("SELECT * FROM compras WHERE beneficiary_id = ?");
            $stmtC->execute([$bId]);
            $comprasRows = $stmtC->fetchAll();
            $compras = [];
            foreach ($comprasRows as $c) {
                $compras[] = [
                    'id' => (int)$c['id'],
                    'type' => $c['type'],
                    'date' => $c['date'],
                    'doc_type' => $c['doc_type'],
                    'doc_afectado' => $c['doc_afectado'],
                    'doc_number' => $c['doc_number'],
                    'control_number' => $c['control_number'],
                    'contact_id' => (int)$c['contact_id'],
                    'is_import_export' => (bool)$c['is_import_export'],
                    'base_exenta' => (float)$c['base_exenta'],
                    'base_general' => (float)$c['base_general'],
                    'tax_general' => (float)$c['tax_general'],
                    'base_reducida' => (float)$c['base_reducida'],
                    'tax_reducida' => (float)$c['tax_reducida'],
                    'base_adicional' => (float)$c['base_adicional'],
                    'tax_adicional' => (float)$c['tax_adicional'],
                    'net_amount' => (float)$c['net_amount'],
                    'tax_amount' => (float)$c['tax_amount'],
                    'total_amount' => (float)$c['total_amount'],
                    'has_retention' => (bool)$c['has_retention'],
                    'retention_pct' => (float)$c['retention_pct'],
                    'retention_amount' => (float)$c['retention_amount'],
                    'retention_number' => $c['retention_number'],
                    'retention_date' => $c['retention_date'],
                    'status' => $c['status'],
                    'notes' => $c['notes'],
                    'export_form_d' => $c['export_form_d'] ?? '',
                    'import_expediente' => $c['import_expediente'] ?? '',
                    'nota_debito' => $c['nota_debito'] ?? '',
                    'nota_credito' => $c['nota_credito'] ?? '',
                    'sin_credito' => isset($c['sin_credito']) ? (float)$c['sin_credito'] : 0.0,
                    'retencion_terceros' => isset($c['retencion_terceros']) ? (float)$c['retencion_terceros'] : 0.0,
                    'iva_percibido_aduana' => isset($c['iva_percibido_aduana']) ? (float)$c['iva_percibido_aduana'] : 0.0
                ];
            }
            
            // Cargar ventas para este beneficiario
            $stmtV = $pdo->prepare("SELECT * FROM ventas WHERE beneficiary_id = ?");
            $stmtV->execute([$bId]);
            $ventasRows = $stmtV->fetchAll();
            $ventas = [];
            foreach ($ventasRows as $v) {
                $ventas[] = [
                    'id' => (int)$v['id'],
                    'type' => $v['type'],
                    'date' => $v['date'],
                    'doc_type' => $v['doc_type'],
                    'doc_afectado' => $v['doc_afectado'],
                    'doc_number' => $v['doc_number'],
                    'control_number' => $v['control_number'],
                    'contact_id' => (int)$v['contact_id'],
                    'is_import_export' => (bool)$v['is_import_export'],
                    'base_exenta' => (float)$v['base_exenta'],
                    'base_general' => (float)$v['base_general'],
                    'tax_general' => (float)$v['tax_general'],
                    'base_reducida' => (float)$v['base_reducida'],
                    'tax_reducida' => (float)$v['tax_reducida'],
                    'base_adicional' => (float)$v['base_adicional'],
                    'tax_adicional' => (float)$v['tax_adicional'],
                    'net_amount' => (float)$v['net_amount'],
                    'tax_amount' => (float)$v['tax_amount'],
                    'total_amount' => (float)$v['total_amount'],
                    'has_retention' => (bool)$v['has_retention'],
                    'retention_pct' => (float)$v['retention_pct'],
                    'retention_amount' => (float)$v['retention_amount'],
                    'retention_number' => $v['retention_number'],
                    'retention_date' => $v['retention_date'],
                    'status' => $v['status'],
                    'notes' => $v['notes'],
                    'fiscal_machine' => $v['fiscal_machine'] ?? '',
                    'control_z' => $v['control_z'] ?? '',
                    'export_form_d' => $v['export_form_d'] ?? '',
                    'nota_debito' => $v['nota_debito'] ?? '',
                    'nota_credito' => $v['nota_credito'] ?? '',
                    'iva_percibido_comprador' => isset($v['iva_percibido_comprador']) ? (float)$v['iva_percibido_comprador'] : 0.0,
                    'ventas_terceros_total' => isset($v['ventas_terceros_total']) ? (float)$v['ventas_terceros_total'] : 0.0,
                    'ventas_terceros_exentas' => isset($v['ventas_terceros_exentas']) ? (float)$v['ventas_terceros_exentas'] : 0.0,
                    'ventas_terceros_gravadas' => isset($v['ventas_terceros_gravadas']) ? (float)$v['ventas_terceros_gravadas'] : 0.0
                ];
            }
            
            // Cargar contactos para este beneficiario
            $stmtCo = $pdo->prepare("SELECT * FROM contactos WHERE beneficiary_id = ?");
            $stmtCo->execute([$bId]);
            $contactosRows = $stmtCo->fetchAll();
            $contactos = [];
            foreach ($contactosRows as $co) {
                $contactos[] = [
                    'id' => (int)$co['id'],
                    'tax_id' => $co['tax_id'],
                    'name' => $co['name'],
                    'type' => $co['type'],
                    'especial' => $co['especial'],
                    'email' => $co['email'],
                    'phone' => $co['phone'],
                    'address' => $co['address']
                ];
            }

            // Cargar ajustes para este beneficiario
            $stmtA = $pdo->prepare("SELECT * FROM ajustes_periodo WHERE beneficiary_id = ?");
            $stmtA->execute([$bId]);
            $ajustesRows = $stmtA->fetchAll();
            $ajustes = [];
            foreach ($ajustesRows as $a) {
                $ajustes[] = [
                    'period' => $a['period'],
                    'quincena' => $a['quincena'],
                    'debito_ajuste' => (float)$a['debito_ajuste'],
                    'debito_exonerado' => (float)$a['debito_exonerado'],
                    'credito_ajuste' => (float)$a['credito_ajuste'],
                    'excedente_anterior' => isset($a['excedente_anterior']) ? (float)$a['excedente_anterior'] : 0.0,
                    'credito_ajuste_tax' => isset($a['credito_ajuste_tax']) ? (float)$a['credito_ajuste_tax'] : 0.0
                ];
            }
            
            $beneficiarios[] = [
                'id' => $bId,
                'name' => $bRow['name'],
                'tax_id' => $bRow['tax_id'],
                'especial' => $bRow['especial'],
                'retencionesAnteriores' => (float)$bRow['retenciones_anteriores'],
                'compras' => $compras,
                'ventas' => $ventas,
                'contactos' => $contactos,
                'ajustes' => $ajustes
            ];
        }
        
        echo json_encode([
            'activeBeneficiaryId' => $activeBeneficiaryId,
            'beneficiarios' => $beneficiarios,
            'config' => $config
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Error al cargar datos de SQLite: ' . $e->getMessage()]);
    }
    exit;
}

// 2. GUARDAR DATOS EN SQLite
if ($action === 'save') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    
    if (!$data || !isset($data['beneficiarios'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Formato de datos no válido para guardado']);
        exit;
    }
    
    try {
        $pdo->beginTransaction();
        
        // Guardar configuración global
        $pdo->exec("DELETE FROM config");
        $stmt = $pdo->prepare("INSERT INTO config (theme, iva_rate, active_beneficiary_id) VALUES (?, ?, ?)");
        $stmt->execute([
            isset($data['config']['theme']) ? $data['config']['theme'] : 'dark',
            isset($data['config']['ivaRate']) ? (float)$data['config']['ivaRate'] : 16.0,
            isset($data['activeBeneficiaryId']) ? (int)$data['activeBeneficiaryId'] : null
        ]);
        
        // Limpiar todas las tablas relacionales para evitar duplicados
        $pdo->exec("DELETE FROM beneficiarios");
        $pdo->exec("DELETE FROM compras");
        $pdo->exec("DELETE FROM ventas");
        $pdo->exec("DELETE FROM contactos");
        $pdo->exec("DELETE FROM ajustes_periodo");
        
        // Sentencias preparadas para inserción veloz
        $stmtB = $pdo->prepare("INSERT INTO beneficiarios (id, name, tax_id, especial, retenciones_anteriores) VALUES (?, ?, ?, ?, ?)");
        
        $stmtC = $pdo->prepare("INSERT INTO compras (id, beneficiary_id, type, date, doc_type, doc_afectado, doc_number, control_number, contact_id, is_import_export, base_exenta, base_general, tax_general, base_reducida, tax_reducida, base_adicional, tax_adicional, net_amount, tax_amount, total_amount, has_retention, retention_pct, retention_amount, retention_number, retention_date, status, notes, export_form_d, import_expediente, nota_debito, nota_credito, sin_credito, retencion_terceros, iva_percibido_aduana) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        
        $stmtV = $pdo->prepare("INSERT INTO ventas (id, beneficiary_id, type, date, doc_type, doc_afectado, doc_number, control_number, contact_id, is_import_export, base_exenta, base_general, tax_general, base_reducida, tax_reducida, base_adicional, tax_adicional, net_amount, tax_amount, total_amount, has_retention, retention_pct, retention_amount, retention_number, retention_date, status, notes, fiscal_machine, control_z, export_form_d, nota_debito, nota_credito, iva_percibido_comprador, ventas_terceros_total, ventas_terceros_exentas, ventas_terceros_gravadas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        
        $stmtCo = $pdo->prepare("INSERT INTO contactos (id, beneficiary_id, tax_id, name, type, especial, email, phone, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");

        $stmtAjustes = $pdo->prepare("INSERT INTO ajustes_periodo (beneficiary_id, period, quincena, debito_ajuste, debito_exonerado, credito_ajuste, excedente_anterior, credito_ajuste_tax) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        
        foreach ($data['beneficiarios'] as $b) {
            $bId = (int)$b['id'];
            $stmtB->execute([
                $bId,
                $b['name'],
                $b['tax_id'],
                $b['especial'],
                isset($b['retencionesAnteriores']) ? (float)$b['retencionesAnteriores'] : 0.0
            ]);
            
            // Insertar compras del beneficiario
            if (isset($b['compras']) && is_array($b['compras'])) {
                foreach ($b['compras'] as $c) {
                    $stmtC->execute([
                        (int)$c['id'],
                        $bId,
                        $c['type'],
                        $c['date'],
                        $c['doc_type'],
                        isset($c['doc_afectado']) ? $c['doc_afectado'] : '',
                        $c['doc_number'],
                        isset($c['control_number']) ? $c['control_number'] : '',
                        (int)$c['contact_id'],
                        isset($c['is_import_export']) ? ($c['is_import_export'] ? 1 : 0) : 0,
                        isset($c['base_exenta']) ? (float)$c['base_exenta'] : 0.0,
                        isset($c['base_general']) ? (float)$c['base_general'] : 0.0,
                        isset($c['tax_general']) ? (float)$c['tax_general'] : 0.0,
                        isset($c['base_reducida']) ? (float)$c['base_reducida'] : 0.0,
                        isset($c['tax_reducida']) ? (float)$c['tax_reducida'] : 0.0,
                        isset($c['base_adicional']) ? (float)$c['base_adicional'] : 0.0,
                        isset($c['tax_adicional']) ? (float)$c['tax_adicional'] : 0.0,
                        isset($c['net_amount']) ? (float)$c['net_amount'] : 0.0,
                        isset($c['tax_amount']) ? (float)$c['tax_amount'] : 0.0,
                        isset($c['total_amount']) ? (float)$c['total_amount'] : 0.0,
                        isset($c['has_retention']) ? ($c['has_retention'] ? 1 : 0) : 0,
                        isset($c['retention_pct']) ? (float)$c['retention_pct'] : 0.0,
                        isset($c['retention_amount']) ? (float)$c['retention_amount'] : 0.0,
                        isset($c['retention_number']) ? $c['retention_number'] : '',
                        isset($c['retention_date']) ? $c['retention_date'] : '',
                        isset($c['status']) ? $c['status'] : 'Pagado',
                        isset($c['notes']) ? $c['notes'] : '',
                        isset($c['export_form_d']) ? $c['export_form_d'] : '',
                        isset($c['import_expediente']) ? $c['import_expediente'] : '',
                        isset($c['nota_debito']) ? $c['nota_debito'] : '',
                        isset($c['nota_credito']) ? $c['nota_credito'] : '',
                        isset($c['sin_credito']) ? (float)$c['sin_credito'] : 0.0,
                        isset($c['retencion_terceros']) ? (float)$c['retencion_terceros'] : 0.0,
                        isset($c['iva_percibido_aduana']) ? (float)$c['iva_percibido_aduana'] : 0.0
                    ]);
                }
            }
            
            // Insertar ventas del beneficiario
            if (isset($b['ventas']) && is_array($b['ventas'])) {
                foreach ($b['ventas'] as $v) {
                    $stmtV->execute([
                        (int)$v['id'],
                        $bId,
                        $v['type'],
                        $v['date'],
                        $v['doc_type'],
                        isset($v['doc_afectado']) ? $v['doc_afectado'] : '',
                        $v['doc_number'],
                        isset($v['control_number']) ? $v['control_number'] : '',
                        (int)$v['contact_id'],
                        isset($v['is_import_export']) ? ($v['is_import_export'] ? 1 : 0) : 0,
                        isset($v['base_exenta']) ? (float)$v['base_exenta'] : 0.0,
                        isset($v['base_general']) ? (float)$v['base_general'] : 0.0,
                        isset($v['tax_general']) ? (float)$v['tax_general'] : 0.0,
                        isset($v['base_reducida']) ? (float)$v['base_reducida'] : 0.0,
                        isset($v['tax_reducida']) ? (float)$v['tax_reducida'] : 0.0,
                        isset($v['base_adicional']) ? (float)$v['base_adicional'] : 0.0,
                        isset($v['tax_adicional']) ? (float)$v['tax_adicional'] : 0.0,
                        isset($v['net_amount']) ? (float)$v['net_amount'] : 0.0,
                        isset($v['tax_amount']) ? (float)$v['tax_amount'] : 0.0,
                        isset($v['total_amount']) ? (float)$v['total_amount'] : 0.0,
                        isset($v['has_retention']) ? ($v['has_retention'] ? 1 : 0) : 0,
                        isset($v['retention_pct']) ? (float)$v['retention_pct'] : 0.0,
                        isset($v['retention_amount']) ? (float)$v['retention_amount'] : 0.0,
                        isset($v['retention_number']) ? $v['retention_number'] : '',
                        isset($v['retention_date']) ? $v['retention_date'] : '',
                        isset($v['status']) ? $v['status'] : 'Pagado',
                        isset($v['notes']) ? $v['notes'] : '',
                        isset($v['fiscal_machine']) ? $v['fiscal_machine'] : '',
                        isset($v['control_z']) ? $v['control_z'] : '',
                        isset($v['export_form_d']) ? $v['export_form_d'] : '',
                        isset($v['nota_debito']) ? $v['nota_debito'] : '',
                        isset($v['nota_credito']) ? $v['nota_credito'] : '',
                        isset($v['iva_percibido_comprador']) ? (float)$v['iva_percibido_comprador'] : 0.0,
                        isset($v['ventas_terceros_total']) ? (float)$v['ventas_terceros_total'] : 0.0,
                        isset($v['ventas_terceros_exentas']) ? (float)$v['ventas_terceros_exentas'] : 0.0,
                        isset($v['ventas_terceros_gravadas']) ? (float)$v['ventas_terceros_gravadas'] : 0.0
                    ]);
                }
            }
            
            // Insertar contactos del beneficiario
            if (isset($b['contactos']) && is_array($b['contactos'])) {
                foreach ($b['contactos'] as $co) {
                    $stmtCo->execute([
                        (int)$co['id'],
                        $bId,
                        $co['tax_id'],
                        $co['name'],
                        $co['type'],
                        isset($co['especial']) ? $co['especial'] : 'no',
                        isset($co['email']) ? $co['email'] : '',
                        isset($co['phone']) ? $co['phone'] : '',
                        isset($co['address']) ? $co['address'] : ''
                    ]);
                }
            }

            // Insertar ajustes del beneficiario
            if (isset($b['ajustes']) && is_array($b['ajustes'])) {
                foreach ($b['ajustes'] as $a) {
                    $stmtAjustes->execute([
                        $bId,
                        $a['period'],
                        $a['quincena'],
                        isset($a['debito_ajuste']) ? (float)$a['debito_ajuste'] : 0.0,
                        isset($a['debito_exonerado']) ? (float)$a['debito_exonerado'] : 0.0,
                        isset($a['credito_ajuste']) ? (float)$a['credito_ajuste'] : 0.0,
                        isset($a['excedente_anterior']) ? (float)$a['excedente_anterior'] : 0.0,
                        isset($a['credito_ajuste_tax']) ? (float)$a['credito_ajuste_tax'] : 0.0
                    ]);
                }
            }
        }
        
        $pdo->commit();
        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Error al escribir transacciones en SQLite: ' . $e->getMessage()]);
    }
    exit;
}

http_response_code(400);
echo json_encode(['error' => 'Operación no válida en el API']);
