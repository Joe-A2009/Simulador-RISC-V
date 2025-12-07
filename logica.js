/**
 * script.js - Simulador RISC-V 
 * (Soporte Completo: R-Type, I-Type, Arrays de IDs, Tooltips con Binario)
 */

// ==========================================
// 1. ESTADO DEL PROCESADOR
// ==========================================
let instrucciones = []; 
let pc = 0;             
let registros = new Int32Array(32);
let memoriaDatos = new Int32Array(32).fill(0); 
let valoresCables = {}; 
let currentTimeouts = [];

// --- NUEVAS VARIABLES DE CONTROL ---
let isRunningInstant = false; // "Run All" (Modo Silencioso)
let autoPlayTimer = null;     // Timer para "Auto"
let isAutoPlaying = false;    // Estado del Auto

// ==========================================
// 2. CONFIGURACIÓN VISUAL
// ==========================================

// --- LISTA MAESTRA DE MÓDULOS (Focus Highlighting) ---
const todosLosModulos = [
    'mod_mem_instr', 'mod_banco_reg', 'mod_alu_ctrl', 'mod_mux_alu',      
    'mod_alu', 'mod_mux_wb', 
    'mod_pc', 'mod_adder_pc', 'mod_mux_pc',
    'mod_mem_data', 'mod_imm_gen', 'mod_mux_imm_type', 
    'mod_ordenamiento', 'mod_uno_solo', 'mod_mux_br'
];

// --- MAPA DE CABLES (Soporta Arrays de IDs) ---
const wireMap = {
    // ... (Control y Datos R/I se quedan igual) ...
    'opcode':   { ids: ['wire_opcode'] },
    'rs1':      { ids: ['wire_rs1'] },
    'rs2':      { ids: ['wire_rs2'] },
    'rd':       { ids: ['wire_rd'] },
    'funct3':   { ids: ['wire_funct3'] },
    'funct7':   { ids: ['wire_funct7'] },
    'ctrl_wer': { ids: ['wire_ctrl_wer'] }, // RegWrite

    'data_rs1': { ids: ['wire_data_rs1'] },
    'data_rs2': { ids: ['wire_data_rs2'] },
    'operand_b':{ ids: ['wire_operand_b'] },
    'alu_ctrl': { ids: ['wire_alu_ctrl_sig'] },
    'alu_res':  { ids: ['wire_alu_result'] },
    'wb_path':  { ids: ['wire_write_back'] }, // Salida del Mux WB
    
    'imm_out':  { ids: ['wire_imm_out'] },

    // --- NUEVOS MEMORIA ---
    'imm_in_type_i':  { ids: ['wire_imm_in_1', 'wire_imm_in_2', 'wire_mux_to_gen'] }, 
    // CAMINO PARA TIPO S (sw)
    'imm_in_type_s':  { ids: ['wire_s_in', 'wire_imm_in_2', 'wire_mux_to_gen'] },
    'ctrl_wem':       { ids: ['wire_ctrl_wem'] },       // Señal WEM (Solo para SW)
    'mem_write_data': { ids: ['wire_mem_write_data'] }, // Dato hacia Memoria (SW)
    'mem_read_data':  { ids: ['wire_mem_read_data'] },   // Dato desde Memoria (LW)
    'mem_addr':       { ids: ['wire_mem_addr'] },

    // --- NUEVOS: SALTOS (TIPO B) ---
    'pc_out':          {  ids: ['wire_pc_out_1', 'wire_pc_out_2'] },
    'pc_plus_4':       { ids: ['wire_pc_plus_4'] },
    'branch_target':   { ids: ['wire_branch_target'] },
    'ord_in':          { ids: ['wire_ord_in_1', 'wire_ord_in_2'] },         // Entradas a Ordenamiento
    'alu_to_uno':      { ids: ['wire_alu_to_uno'] },      // ALU -> Uno Solo
    'br_true':         { ids: ['wire_br_true'] },         // Camino Verdad (1)
    'br_false':        { ids: ['wire_br_false'] },        // Camino Falso (0)
    'muxpc_to_adder':  { ids: ['wire_muxpc_to_adder'] },  // Feedback al sumador
    // Señal final de decisión (Salida de Mux Br hacia Mux PC)
    'pc_src':          { ids: ['wire_pc_src'] },
    'next_pc':         { ids: ['wire_next_pc'] }
};

// ==========================================
// 3. INTERFAZ DE USUARIO
// ==========================================

function cargarInstrucciones() {
    const rawText = document.getElementById('asmInput').value;
    const lineasCrudas = rawText.split('\n');
    instrucciones = []; // Aquí guardaremos el texto original limpio si pasa

    // --- FASE DE VALIDACIÓN ESTRICTA ---
    for (let i = 0; i < lineasCrudas.length; i++) {
        const linea = lineasCrudas[i].trim();
        
        // Ignorar vacíos y comentarios puros
        if (linea === '' || linea.startsWith('#')) continue;

        // Intentar parsear
        const resultado = parsearLineaEstricto(linea);

        // Si devolvió un objeto con error, detenemos todo
        if (resultado && resultado.error) {
            alert(`Error de Sintaxis en línea ${i + 1}:\n"${linea}"\n\n${resultado.error}`);
            return; // ABORTAR
        }

        // Si pasó, guardamos la línea original (o podrías guardar 'resultado' procesado)
        // Guardamos la línea limpia de comentarios para el procesador
        instrucciones.push(linea.split('#')[0].trim());
    }
    
    if (instrucciones.length === 0) {
        alert("El código está vacío.");
        return;
    }

    // --- INICIAR SIMULADOR ---
    detenerAutoPlay();
    pc = 0;
    valoresCables = {};
    limpiarCables();
    registros.fill(0);      
    memoriaDatos.fill(0);   
    
    resaltarModulosActivos(todosLosModulos); 
    actualizarPanelInfo("Código validado y cargado.", 0);
    actualizarVisualizacionMemoria(); 
    
    const btnNext = document.getElementById('btnNext');
    btnNext.disabled = false;
    btnNext.style.opacity = "1";

    desbloquearSimulador();
    console.log("Programa cargado exitosamente.");
}

function siguienteInstruccion() {
    if (pc >= instrucciones.length) {
        alert("Fin del programa.");
        return;
    }
    const instActual = instrucciones[pc].trim();
    actualizarPanelInfo(instActual, pc * 4);
    procesarInstruccion(instActual);
    pc++;
}

function actualizarPanelInfo(texto, pcVal) {
    document.getElementById('currentInst').innerText = texto;
    document.getElementById('pcValue').innerText = pcVal;
}

// ==========================================
// 4. LÓGICA PRINCIPAL
// ==========================================
// ==========================================
// 4. LÓGICA PRINCIPAL (PARSER MEJORADO)
// ==========================================
function procesarInstruccion(asm) {
    limpiarCables(); 
    valoresCables = {}; 

    // Usamos el parser estricto para obtener las partes limpias
    // [mnemonico, arg1, arg2, arg3]
    const partes = parsearLineaEstricto(asm);

    if (!partes || partes.error) {
        // Esto no debería pasar si cargarInstrucciones hizo su trabajo,
        // pero por seguridad:
        console.error("Error en ejecución:", partes ? partes.error : "Desconocido");
        actualizarPanelInfo("Error Fatal de Sintaxis", pc*4);
        return;
    }

    const mnemonico = partes[0];

    // Enrutamiento (Tus listas de tipos)
    const tipoR = ['add', 'sub', 'sll', 'slt', 'sltu', 'xor', 'srl', 'sra', 'or', 'and'];
    const tipoI = ['addi', 'andi', 'ori', 'xori', 'slti', 'sltui', 'slli', 'srli', 'srai'];
    const tipoL = ['lw']; 
    const tipoS = ['sw']; 
    const tipoB = ['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu'];

    if (tipoR.includes(mnemonico)) ejecutarTipoR(mnemonico, partes);
    else if (tipoI.includes(mnemonico)) ejecutarTipoI(mnemonico, partes);
    else if (tipoL.includes(mnemonico)) ejecutarTipoL(mnemonico, partes);
    else if (tipoS.includes(mnemonico)) ejecutarTipoS(mnemonico, partes);
    else if (tipoB.includes(mnemonico)) ejecutarTipoB(mnemonico, partes);
}

// Helper para asignar texto a TODOS los IDs físicos de un cable lógico
function asignarTooltip(nombreLogico, texto) {
    if (wireMap[nombreLogico] && wireMap[nombreLogico].ids) {
        wireMap[nombreLogico].ids.forEach(id => {
            valoresCables[id] = texto;
        });
    }
}

// ==========================================
// VALIDACIONES DE SINTAXIS (SEMÁNTICA)
// ==========================================

// Verifica si es un registro válido (x0 - x31)
function esRegistro(str) {
    // Regex: Empieza con x, seguido de 1 o 2 dígitos
    if (!/^x\d+$/.test(str)) return false;
    const num = parseInt(str.substring(1));
    return num >= 0 && num <= 31;
}

// Verifica si es un número válido (Decimal o Hexadecimal)
function esInmediato(str) {
    // Regex: Opcional signo negativo, seguido de dígitos O formato 0x...
    return /^-?(0x[0-9a-fA-F]+|\d+)$/.test(str);
}

// Función Principal de Parseo y Validación
function parsearLineaEstricto(linea) {
    const sinComentarios = linea.split('#')[0].trim();
    if (!sinComentarios) return null;

    const primerEspacio = sinComentarios.indexOf(' ');
    if (primerEspacio === -1) {
        return { error: "Instrucción incompleta (faltan operandos)" };
    }

    const mnemonico = sinComentarios.substring(0, primerEspacio).toLowerCase();
    const argumentosRaw = sinComentarios.substring(primerEspacio).trim();

    // --- 1. DEFINICIÓN DE TIPOS ---
    const tipoR = ['add', 'sub', 'sll', 'slt', 'sltu', 'xor', 'srl', 'sra', 'or', 'and'];
    const tipoI = ['addi', 'andi', 'ori', 'xori', 'slti', 'sltui', 'slli', 'srli', 'srai']; // I-Aritmético
    const tipoB = ['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu'];
    const tipoMem = ['lw', 'sw']; // L y S comparten estructura lógica aquí

    // --- 2. EXTRACCIÓN CON REGEX (ESTRUCTURA) ---
    
    // Estructura Memoria: "op1, offset(base)"
    const regexMemoria = /^([\w-]+)\s*,\s*(-?[\w]+)\s*\(\s*([\w-]+)\s*\)$/;
    
    // Estructura Estándar: "op1, op2, op3"
    const regexEstandar = /^([\w-]+)\s*,\s*([\w-]+)\s*,\s*(-?[\w]+)$/;

    let partes = null;

    // --- 3. VALIDACIÓN SEMÁNTICA (CONTENIDO) ---

    // CASO A: MEMORIA (LW, SW)
    if (tipoMem.includes(mnemonico)) {
        const match = argumentosRaw.match(regexMemoria);
        if (!match) {
            return { error: `Sintaxis incorrecta para '${mnemonico}'.\nUso: ${mnemonico} reg, offset(reg_base)\nEj: ${mnemonico} x1, 4(x2)` };
        }
        // Estructura extraída: [mnemonico, op1, offset, base]
        const op1 = match[1];
        const offset = match[2];
        const base = match[3];

        // Validar tipos
        if (!esRegistro(op1)) return { error: `El primer operando '${op1}' debe ser un registro (x0-x31).` };
        if (!esInmediato(offset)) return { error: `El offset '${offset}' debe ser un número.` };
        if (!esRegistro(base)) return { error: `La base '${base}' (dentro del paréntesis) debe ser un registro.` };

        return [mnemonico, op1, offset, base];
    }
    
    // CASO B: ESTÁNDAR (R, I, B)
    else if (tipoR.includes(mnemonico) || tipoI.includes(mnemonico) || tipoB.includes(mnemonico)) {
        const match = argumentosRaw.match(regexEstandar);
        if (!match) {
            return { error: `Sintaxis incorrecta para '${mnemonico}'.\nUso: ${mnemonico} op1, op2, op3 (separados por comas)` };
        }
        const op1 = match[1];
        const op2 = match[2];
        const op3 = match[3];

        // SUB-VALIDACIÓN POR TIPO
        
        // Tipo R (add x1, x2, x3) -> Todo registros
        if (tipoR.includes(mnemonico)) {
            if (!esRegistro(op1)) return { error: `Operando 1 '${op1}' debe ser registro.` };
            if (!esRegistro(op2)) return { error: `Operando 2 '${op2}' debe ser registro.` };
            if (!esRegistro(op3)) return { error: `Operando 3 '${op3}' debe ser registro (Tipo R no acepta inmediatos).` };
        }
        
        // Tipo I y B (addi x1, x2, 10) -> Reg, Reg, Imm
        else {
            if (!esRegistro(op1)) return { error: `Operando 1 '${op1}' debe ser registro.` };
            if (!esRegistro(op2)) return { error: `Operando 2 '${op2}' debe ser registro.` };
            if (!esInmediato(op3)) return { error: `Operando 3 '${op3}' debe ser un inmediato (número).` };
        }

        return [mnemonico, op1, op2, op3];
    }
    
    else {
        return { error: `Instrucción desconocida: "${mnemonico}"` };
    }
}

// --- LÓGICA TIPO R ---
function ejecutarTipoR(op, partes) {
    if (partes.length < 4) return;

    resaltarModulosActivos([
        'mod_mem_instr', 'mod_banco_reg', 'mod_alu_ctrl', 
        'mod_mux_alu', 'mod_alu', 'mod_mux_wb'
    ]);

    const rdIdx = getRegIndex(partes[1]);
    const rs1Idx = getRegIndex(partes[2]);
    const rs2Idx = getRegIndex(partes[3]);

    const valRs1 = registros[rs1Idx];
    const valRs2 = registros[rs2Idx];
    let resultado = 0;
    const shiftAmt = valRs2 & 0x1F; 

    switch (op) {
        case 'add': resultado = valRs1 + valRs2; break;
        case 'sub': resultado = valRs1 - valRs2; break;
        case 'sll': resultado = valRs1 << shiftAmt; break;
        case 'slt': resultado = (valRs1 < valRs2) ? 1 : 0; break;
        case 'sltu': resultado = ((valRs1 >>> 0) < (valRs2 >>> 0)) ? 1 : 0; break;
        case 'xor': resultado = valRs1 ^ valRs2; break;
        case 'srl': resultado = valRs1 >>> shiftAmt; break;
        case 'sra': resultado = valRs1 >> shiftAmt; break;
        case 'or':  resultado = valRs1 | valRs2; break;
        case 'and': resultado = valRs1 & valRs2; break;
    }

    resultado = resultado | 0; 
    if (rdIdx !== 0) registros[rdIdx] = resultado;
    actualizarVisualizacionMemoria(rdIdx);

    // --- TOOLTIPS CON BINARIO ---
    asignarTooltip('opcode', `Inst: ${op.toUpperCase()} (R)`);
    asignarTooltip('rs1', `Rs1: x${rs1Idx}`);
    asignarTooltip('rs2', `Rs2: x${rs2Idx}`);
    asignarTooltip('rd',  `Rd: x${rdIdx}`);
    
    asignarTooltip('data_rs1', `Val: ${valRs1}\nHex: 0x${toHex(valRs1)}\nBin: ${toBin(valRs1)}`);
    asignarTooltip('data_rs2', `Val: ${valRs2}\nHex: 0x${toHex(valRs2)}\nBin: ${toBin(valRs2)}`);
    asignarTooltip('operand_b',`In B: ${valRs2}\nBin: ${toBin(valRs2)}`);
    
    asignarTooltip('alu_ctrl', `Op: ${op.toUpperCase()}`);
    asignarTooltip('alu_res',  `Res: ${resultado}\nHex: 0x${toHex(resultado)}\nBin: ${toBin(resultado)}`);
    asignarTooltip('wb_path',  `WB: ${resultado}\nBin: ${toBin(resultado)}`);
    asignarTooltip('ctrl_wer', "RegWrite: 1");

    animarSecuencia([
        ['opcode', 'rs1', 'rs2', 'rd', 'funct3', 'funct7'],
        ['data_rs1', 'data_rs2', 'operand_b', 'alu_ctrl','ctrl_wer'],
        ['alu_res', 'wb_path']
    ], 'wire-type-r');
}

// --- LÓGICA TIPO I ---
function ejecutarTipoI(op, partes) {
    if (partes.length < 4) return;

    resaltarModulosActivos([
        'mod_mem_instr', 'mod_banco_reg', 'mod_alu_ctrl', 
        'mod_mux_imm_type', 'mod_imm_gen', 
        'mod_mux_alu', 'mod_alu', 'mod_mux_wb'
    ]);

    const rdIdx = getRegIndex(partes[1]);
    const rs1Idx = getRegIndex(partes[2]);
    const inmediato = parseInt(partes[3]); 

    const valRs1 = registros[rs1Idx];
    let resultado = 0;
    const shamt = inmediato & 0x1F;

    switch (op) {
        case 'addi': resultado = valRs1 + inmediato; break;
        case 'andi': resultado = valRs1 & inmediato; break;
        case 'ori':  resultado = valRs1 | inmediato; break;
        case 'xori': resultado = valRs1 ^ inmediato; break;
        case 'slti': resultado = (valRs1 < inmediato) ? 1 : 0; break;
        case 'sltui': resultado = ((valRs1 >>> 0) < (inmediato >>> 0)) ? 1 : 0; break;
        case 'slli': resultado = valRs1 << shamt; break;
        case 'srli': resultado = valRs1 >>> shamt; break;
        case 'srai': resultado = valRs1 >> shamt; break;
    }

    resultado = resultado | 0;
    if (rdIdx !== 0) registros[rdIdx] = resultado;
    actualizarVisualizacionMemoria(rdIdx);

    // --- TOOLTIPS CON BINARIO ---
    asignarTooltip('opcode', `Inst: ${op.toUpperCase()} (I)`);
    asignarTooltip('rs1', `Rs1: x${rs1Idx}`);
    asignarTooltip('rd',  `Rd: x${rdIdx}`);
    
    // Inmediato Entrada (Se asigna a todos los segmentos físicos)
    asignarTooltip('imm_in_type_i', `Raw Imm: ${inmediato}\nHex: 0x${toHex(inmediato)}\nBin: ${toBin(inmediato)}`);
    asignarTooltip('data_rs1', `Val: ${valRs1}\nHex: 0x${toHex(valRs1)}\nBin: ${toBin(valRs1)}`);
    
    // Inmediato Extendido
    asignarTooltip('imm_out', `Ext Imm: ${inmediato}\nHex: 0x${toHex(inmediato)}\nBin: ${toBin(inmediato)}`);
    asignarTooltip('operand_b', `In B (Imm): ${inmediato}\nBin: ${toBin(inmediato)}`);
    
    asignarTooltip('alu_ctrl', `Op: ${op.toUpperCase()}`);
    asignarTooltip('alu_res', `Res: ${resultado}\nHex: 0x${toHex(resultado)}\nBin: ${toBin(resultado)}`);
    asignarTooltip('wb_path', `WB: ${resultado}\nBin: ${toBin(resultado)}`);
    asignarTooltip('ctrl_wer', "RegWrite: 1");

    animarSecuencia([
        ['opcode', 'rs1', 'rd', 'funct3', 'imm_in_type_i'],
        ['data_rs1', 'imm_out', 'operand_b', 'alu_ctrl', 'ctrl_wer'],
        ['alu_res', 'wb_path']
    ], 'wire-type-i');
}

// --- LÓGICA TIPO L (LOAD - LW) ---
function ejecutarTipoL(op, partes) {
    if (partes.length < 4) return;

    resaltarModulosActivos([
        'mod_mem_instr', 'mod_banco_reg', 'mod_alu_ctrl', 'mod_imm_gen', 
        'mod_mux_imm_type', 'mod_mux_alu', 'mod_alu', 'mod_mem_data', 'mod_mux_wb'
    ]);

    const rdIdx = getRegIndex(partes[1]);
    const offset = parseInt(partes[2]);
    const rs1Idx = getRegIndex(partes[3]);

    const valRs1 = registros[rs1Idx];
    const direccionMemoria = valRs1 + offset;
    const indiceMem = Math.floor(direccionMemoria / 4);
    
    let valorLeido = 0;
    if (indiceMem >= 0 && indiceMem < 32) valorLeido = memoriaDatos[indiceMem];

    if (rdIdx !== 0) registros[rdIdx] = valorLeido;
    actualizarVisualizacionMemoria(rdIdx);

    // --- TOOLTIPS ---
    asignarTooltip('opcode', `Inst: LW`);
    asignarTooltip('rs1', `Base: x${rs1Idx}`);
    asignarTooltip('rd', `Dest: x${rdIdx}`);
    asignarTooltip('imm_in_type_i', `Offset: ${offset}`);
    asignarTooltip('imm_out', `Offset Ext: ${offset}`);
    
    // Diferenciación visual en Tooltips
    asignarTooltip('alu_res', `Calculando Dir: ${direccionMemoria}`);
    asignarTooltip('mem_addr', `Address RAM: ${direccionMemoria}`); // <--- NUEVO
    
    asignarTooltip('mem_read_data', `Leído: ${valorLeido}\nHex: 0x${toHex(valorLeido)}`);
    asignarTooltip('wb_path', `WB: ${valorLeido}`);
    asignarTooltip('ctrl_wer', "RegWrite: 1");

    // --- ANIMACIÓN ÁMBAR ---
    const e1 = ['opcode', 'rs1', 'rd', 'funct3', 'imm_in_type_i'];
    const e2 = ['data_rs1', 'imm_out', 'operand_b', 'alu_ctrl', 'ctrl_wer']; 
    const e3 = ['mem_addr', 'mem_read_data']; 
    const e4 = ['wb_path'];

    animarSecuencia([e1, e2, e3, e4], 'wire-type-l');
}

// --- LÓGICA TIPO S (STORE - SW) ---
function ejecutarTipoS(op, partes) {
    if (partes.length < 4) return;

    resaltarModulosActivos([
        'mod_mem_instr', 'mod_banco_reg', 'mod_alu_ctrl', 'mod_imm_gen', 
        'mod_mux_imm_type', 'mod_mux_alu', 'mod_alu', 'mod_mem_data'
    ]);

    const rs2Idx = getRegIndex(partes[1]); 
    const offset = parseInt(partes[2]);
    const rs1Idx = getRegIndex(partes[3]);

    const valRs1 = registros[rs1Idx];
    const valRs2 = registros[rs2Idx]; 
    const direccionMemoria = valRs1 + offset;
    const indiceMem = Math.floor(direccionMemoria / 4);

    if (indiceMem >= 0 && indiceMem < 32) memoriaDatos[indiceMem] = valRs2;
    actualizarVisualizacionMemoria(-1); 

    // --- TOOLTIPS ---
    asignarTooltip('opcode', `Inst: SW`);
    asignarTooltip('rs1', `Base: x${rs1Idx}`);
    asignarTooltip('rs2', `Fuente: x${rs2Idx}`);
    asignarTooltip('imm_in_type_s', `Offset: ${offset}`);
    
    // Diferenciación visual en Tooltips
    asignarTooltip('alu_res', `Calculando Dir: ${direccionMemoria}`);
    asignarTooltip('mem_addr', `Address RAM: ${direccionMemoria}`); // <--- NUEVO
    
    asignarTooltip('mem_write_data', `Escribiendo: ${valRs2}\nHex: 0x${toHex(valRs2)}`);
    asignarTooltip('ctrl_wem', "WEM: 1");

    // --- ANIMACIÓN MAGENTA ---
    const e1 = ['opcode', 'rs1', 'rs2', 'funct3', 'imm_in_type_s'];
    const e2 = ['data_rs1', 'imm_out', 'alu_ctrl', 'ctrl_wem', 'data_rs2', 'mem_write_data'];
    const e3 = ['mem_addr', 'operand_b'];

    animarSecuencia([e1, e2, e3], 'wire-type-s');
}

// --- FUNCIÓN TIPO B (BRANCH) - FINAL CORREGIDA ---
function ejecutarTipoB(op, partes) {
    if (partes.length < 4) return;

    // 1. Focus: Encendemos módulos de Branch
    resaltarModulosActivos([
        'mod_mem_instr', 'mod_banco_reg', 'mod_alu_ctrl', 
        'mod_mux_alu', 'mod_alu', 
        'mod_pc', 'mod_adder_pc', 'mod_mux_pc', 'mod_adder_branch',
        'mod_ordenamiento', 'mod_uno_solo', 'mod_mux_br'
    ]);

    const rs1Idx = getRegIndex(partes[1]);
    const rs2Idx = getRegIndex(partes[2]);
    const offset = parseInt(partes[3]);

    const valRs1 = registros[rs1Idx];
    const valRs2 = registros[rs2Idx];
    
    // Evaluación
    let tomarSalto = false;
    switch (op) {
        case 'beq':  tomarSalto = (valRs1 === valRs2); break;
        case 'bne':  tomarSalto = (valRs1 !== valRs2); break;
        case 'blt':  tomarSalto = (valRs1 < valRs2);   break;
        case 'bge':  tomarSalto = (valRs1 >= valRs2);  break;
        case 'bltu': tomarSalto = ((valRs1 >>> 0) < (valRs2 >>> 0));  break;
        case 'bgeu': tomarSalto = ((valRs1 >>> 0) >= (valRs2 >>> 0)); break;
    }

    const resultadoComp = tomarSalto ? 1 : 0; // Para mostrar en el cable

    // Actualización PC
    const pcActual = pc * 4;
    const pcSalto = pcActual + offset;
    
    if (tomarSalto) {
        const saltoInstrucciones = offset / 4;
        pc = pc + saltoInstrucciones - 1; 
    }

    // --- TOOLTIPS CORREGIDOS ---
    asignarTooltip('opcode', `Inst: ${op.toUpperCase()} (B)`);
    asignarTooltip('rs1', `Op1: x${rs1Idx}`);
    asignarTooltip('rs2', `Op2: x${rs2Idx}`);
    asignarTooltip('ord_in', `Offset: ${offset}`); 
    
    // 1. Tooltip Control
    asignarTooltip('alu_ctrl', `Ctrl: Branch (Tipo B)`);

    // 2. Tooltip Resultado Comparación (En el cable ALU -> Uno Solo)
    asignarTooltip('alu_res', `Comp: ${resultadoComp}`);
    asignarTooltip('alu_to_uno', `Resultado: ${resultadoComp} (${tomarSalto ? "True" : "False"})`);

    asignarTooltip('pc_src', `Saltar: ${tomarSalto ? "SÍ" : "NO"}`);
    
    // Tooltips PC
    asignarTooltip('pc_out', `PC: ${pcActual}`); // Se aplica a wire_pc_out_1 y 2
    asignarTooltip('pc_plus_4', `PC+4: ${pcActual + 4}`);
    asignarTooltip('branch_target', `Target: ${pcSalto}`);
    asignarTooltip('next_pc', `Next PC: ${tomarSalto ? pcSalto : pcActual + 4}`);

    // --- ANIMACIÓN VIOLETA ---
    
    // Etapa 1: Decode & Envío de datos
    // AGREGADO: funct3, funct7. 
    // AGREGADO: pc_out (esto iluminará wire_pc_out_1 y 2)
    const e1 = ['opcode', 'rs1', 'rs2', 'funct3', 'funct7', 'ord_in'];
    
    // Etapa 2: Comparación & Cálculo PC+4
    // AGREGADO: pc_plus_4 (esto ilumina la salida del sumador)
    const e2 = ['alu_ctrl', 'operand_b', 'data_rs1', 'data_rs2'];
    
    // Etapa 3: Decisión
    const caminoDecision = tomarSalto ? 'br_true' : 'br_false';
    const caminoTarget = tomarSalto ? 'branch_target' : 'pc_plus_4';
    
    // Iluminamos el camino elegido y la entrada al PC
    const e3 = ['alu_to_uno', caminoDecision, 'pc_src', caminoTarget, 'muxpc_to_adder'];
    const e4 = ['next_pc','pc_out','pc_plus_4']

    animarSecuencia([e1, e2, e3, e4], 'wire-type-b');
}

// ==========================================
// 5. SISTEMA VISUAL (ANIMACIÓN + FOCUS)
// ==========================================

function animarSecuencia(etapas, claseColor) {
    if (isRunningInstant) return; // Si es instantáneo, no pintes nada
    currentTimeouts.forEach(t => clearTimeout(t));
    currentTimeouts = [];
    const intervalo = 1500;

    etapas.forEach((grupoCables, index) => {
        const t = setTimeout(() => {
            grupoCables.forEach(nombreLogico => {
                const info = wireMap[nombreLogico];
                // Iteramos sobre TODOS los IDs físicos del cable lógico
                if (info && info.ids) {
                    info.ids.forEach(idFisico => {
                        const el = document.getElementById(idFisico);
                        if (el) el.classList.add('wire-active', claseColor);
                    });
                }
            });
        }, index * intervalo);
        currentTimeouts.push(t);
    });
}

function limpiarCables() {
    if (isRunningInstant) return; // Si es instantáneo, no pintes nada
    // 1. Cancelar animaciones pendientes
    currentTimeouts.forEach(t => clearTimeout(t));
    currentTimeouts = [];

    // 2. Limpiar clases visuales en el SVG
    Object.values(wireMap).forEach(info => {
        if (info.ids) {
            info.ids.forEach(idFisico => {
                const el = document.getElementById(idFisico);
                if (el) {
                    // AQUÍ ESTABA EL ERROR: Faltaba remover las clases L y S
                    el.classList.remove(
                        'wire-active', 
                        'wire-type-r', // Verde
                        'wire-type-i', // Cyan
                        'wire-type-l', // Ámbar (NUEVO)
                        'wire-type-s',  // Magenta (NUEVO)
                        'wire-type-b'
                    );
                }
            });
        }
    });
}

function resaltarModulosActivos(listaActivos) {
    if (isRunningInstant) return; // Si es instantáneo, no pintes nada
    todosLosModulos.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (listaActivos.includes(id)) {
                el.classList.remove('module-dimmed');
                el.classList.add('module-active');
            } else {
                el.classList.add('module-dimmed');
                el.classList.remove('module-active');
            }
        }
    });
}

// ==========================================
// 6. UTILIDADES
// ==========================================
// ==========================================
// X. MODOS DE EJECUCIÓN (AUTO & RUN ALL)
// ==========================================

// --- OPCIÓN A: RUN ALL (Instantáneo) ---
function ejecutarTodo() {
    if (instrucciones.length === 0) return;

    // 1. Activar Modo Silencioso (Apaga animaciones)
    isRunningInstant = true;
    
    // 2. Ejecutar bucle
    let limite = 1000; // Protección contra bucles infinitos
    let ops = 0;

    const startTime = performance.now();

    while (pc < instrucciones.length && ops < limite) {
        // Ejecutamos la lógica pura (sin visuales gracias al flag)
        const instActual = instrucciones[pc].trim();
        procesarInstruccion(instActual);
        pc++; // Avanzamos PC
        ops++;
    }

    // 3. Desactivar Modo Silencioso
    isRunningInstant = false;

    // 4. Actualizar Visuales Finales UNA SOLA VEZ
    // Limpiamos cables viejos que pudieran haber quedado
    Object.values(wireMap).forEach(info => {
        if (info.ids) info.ids.forEach(id => document.getElementById(id)?.classList.remove('wire-active', 'wire-type-r', 'wire-type-i', 'wire-type-l', 'wire-type-s', 'wire-type-b'));
    });
    
    // Mostramos estado final
    actualizarVisualizacionMemoria(); 
    actualizarPanelInfo("Fin de ejecución (Run All)", pc * 4);
    
    // Encendemos todos los módulos para que se vea bonito el final
    resaltarModulosActivos(todosLosModulos);

    if (ops >= limite) alert("Se alcanzó el límite de 1000 instrucciones (Posible bucle infinito).");
}

// --- OPCIÓN B: AUTO PLAY (Paso a Paso Automático) ---
function toggleAutoPlay() {
    const btn = document.getElementById('btnAuto');
    
    if (isAutoPlaying) {
        // DETENER
        detenerAutoPlay();
        btn.innerText = "▶ Auto";
        btn.className = "btn-warning"; // Volver a amarillo
    } else {
        // INICIAR
        if (pc >= instrucciones.length) {
            alert("El programa ya terminó. Reinicia para usar Auto.");
            return;
        }
        isAutoPlaying = true;
        btn.innerText = "⏹ Stop";
        btn.className = "btn-danger"; // Poner en rojo
        
        // Bloquear otros botones para evitar conflictos
        document.getElementById('btnNext').disabled = true;
        document.getElementById('btnRunAll').disabled = true;

        cicloAuto();
    }
}

function cicloAuto() {
    if (!isAutoPlaying) return;

    if (pc >= instrucciones.length) {
        detenerAutoPlay();
        alert("Ejecución automática finalizada.");
        return;
    }

    // 1. Ejecutar un paso (Esto dispara las animaciones)
    siguienteInstruccion();

    // 2. Esperar a que terminen las animaciones para el siguiente paso.
    // Tus animaciones duran (N etapas * 1500ms).
    // El máximo son 4 etapas (Tipo L/S) = 6000ms.
    // Ponemos 6500ms para dar un respiro visual.
    autoPlayTimer = setTimeout(cicloAuto, 6500); 
}

function detenerAutoPlay() {
    isAutoPlaying = false;
    clearTimeout(autoPlayTimer);
    
    // Restaurar botones
    const btn = document.getElementById('btnAuto');
    if(btn) {
        btn.innerText = "▶ Auto";
        btn.className = "btn-warning";
    }
    document.getElementById('btnNext').disabled = false;
    document.getElementById('btnRunAll').disabled = false;
}

function getRegIndex(regStr) {
    if (!regStr) return 0;
    return parseInt(regStr.toLowerCase().replace('x', '').replace(',', '')) || 0;
}
function toHex(num) { return (num >>> 0).toString(16).toUpperCase().padStart(8, '0'); }
function toBin(num) { return (num >>> 0).toString(2).padStart(32, '0'); }

// ==========================================
// 7. EVENTOS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Archivos
    const fileInput = document.getElementById('fileInput');
    const textArea = document.getElementById('asmInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const archivo = e.target.files[0];
            if (!archivo) return;
            const lector = new FileReader();
            lector.onload = function(evento) {
                textArea.value = evento.target.result;
                alert(`Archivo "${archivo.name}" cargado.`);
            };
            lector.readAsText(archivo);
            e.target.value = ''; 
        });
    }

    // Tooltips
    const tooltip = document.getElementById('bitTooltip');
    const svg = document.querySelector('svg');
    if(svg && tooltip) {
        svg.addEventListener('mousemove', (e) => {
            const targetId = e.target.id;
            // Busca si hay información guardada para este ID físico
            if (targetId && valoresCables[targetId]) {
                tooltip.style.display = 'block';
                tooltip.style.left = (e.pageX + 20) + 'px';
                tooltip.style.top = (e.pageY + 20) + 'px';
                tooltip.innerHTML = valoresCables[targetId].replace(/\n/g, '<br>');
                e.target.style.cursor = "crosshair";
            } else {
                tooltip.style.display = 'none';
            }
        });
        svg.addEventListener('mouseout', (e) => {
            tooltip.style.display = 'none';
        });
    }
});

// ==========================================
// 8. VISUALIZACIÓN DE MEMORIA
// ==========================================
function actualizarVisualizacionMemoria(regDestinoIdx = -1) {
    const grid = document.getElementById('registerGrid');
    if (grid) {
        grid.innerHTML = '';
        for (let i = 0; i < 32; i++) {
            const val = registros[i];
            const div = document.createElement('div');
            div.className = 'reg-box';
            if (i === regDestinoIdx) div.classList.add('reg-updated');
            div.innerHTML = `<span class="reg-name">x${i}</span><span class="reg-val">${val}</span>`;
            grid.appendChild(div);
        }
    }
    const tbody = document.getElementById('memoryBody');
    if (tbody) {
        tbody.innerHTML = '';
        for (let i = 0; i < 16; i++) { 
            const val = memoriaDatos[i];
            const address = i * 4; 
            const row = document.createElement('tr');
            row.innerHTML = `<td>0x${toHex(address)}</td><td>${val}</td><td style="color: #90caf9">0x${toHex(val)}</td>`;
            tbody.appendChild(row);
        }
    }
}

// ==========================================
// X. GESTIÓN DE PESTAÑAS (UI)
// ==========================================

function cambiarPestana(pestana) {
    const viewEditor = document.getElementById('viewEditor');
    const viewSim = document.getElementById('viewSimulator');
    const tabEditor = document.getElementById('tabEditor');
    const tabSim = document.getElementById('tabSim');

    if (pestana === 'editor') {
        // Mostrar Editor
        viewEditor.classList.remove('hidden-view');
        viewEditor.classList.add('active-view');
        viewSim.classList.remove('active-view');
        viewSim.classList.add('hidden-view');
        
        tabEditor.classList.add('active');
        tabSim.classList.remove('active');
    } 
    else if (pestana === 'simulator') {
        // Mostrar Simulador (Solo si no está disabled)
        if (tabSim.disabled) return;

        viewSim.classList.remove('hidden-view');
        viewSim.classList.add('active-view');
        viewEditor.classList.remove('active-view');
        viewEditor.classList.add('hidden-view');

        tabSim.classList.add('active');
        tabEditor.classList.remove('active');
    }
}

function desbloquearSimulador() {
    const tabSim = document.getElementById('tabSim');
    tabSim.disabled = false;
    tabSim.classList.remove('disabled');
    // Automáticamente ir al simulador
    cambiarPestana('simulator');
}