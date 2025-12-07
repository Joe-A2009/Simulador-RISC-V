# Simulador Visual de Procesador RISC-V (Single Cycle)

![RISC-V Simulator Banner](https://img.shields.io/badge/Architecture-RISC--V-red) ![Status](https://img.shields.io/badge/Status-Stable-success) 

Un simulador web interactivo y **Didáctico** del Datapath de un procesador **RISC-V de Ciclo Único (32-bits)**. 

Este proyecto fue diseñado para estudiantes y entusiastas de la Arquitectura de Computadoras, permitiendo visualizar en tiempo real cómo viajan los datos a través de los cables, cómo deciden los multiplexores y cómo se escriben los registros y la memoria RAM.

---

## Características Principales

* **Visualización del Datapath:** Iluminación de cables por etapas (Decode, Execute, Memory, WriteBack) con colores específicos según el tipo de instrucción.
* **IDE Integrado:** Editor de código ensamblador con **validador de sintaxis estricto** (Parser Regex). Detecta errores antes de simular.
* **Modos de Ejecución:**
    * **Paso a Paso:** Para análisis detallado.
    * **Auto Play:** Ejecución automática con velocidad ajustable.
    * **Run All:** Ejecución instantánea para algoritmos largos.
* **Memoria Viva:** Visualización en tiempo real del Banco de Registros (`x0`-`x31`) y Memoria de Datos (RAM).
* **Diseño Responsivo:** Interfaz adaptable que funciona en escritorio y permite navegación táctil (panning) en móviles.

---

## Set de Instrucciones Soportado

El simulador implementa un subconjunto robusto de la arquitectura **RV32I**:

| Tipo | Mnemónicos | Color Visual | Descripción |
| :--- | :--- | :--- | :--- |
| **Tipo R** | `add`, `sub`, `and`, `or`, `xor`, `sll`, `srl`, `sra`, `slt`, `sltu` | 🟢 **Verde** | Operaciones aritméticas entre registros. |
| **Tipo I** | `addi`, `andi`, `ori`, `xori`, `slti`, `sltui`, `slli`, `srli`, `srai` | 🔵 **Cyan** | Operaciones con inmediatos y lógica ALU. |
| **Tipo L** | `lw` | 🟠 **Ámbar** | Carga de datos desde Memoria (Load). |
| **Tipo S** | `sw` | 🟣 **Magenta** | Escritura en Memoria (Store). |
| **Tipo B** | `beq`, `bne`, `blt`, `bge`, `bltu`, `bgeu` | 😈 **Violeta** | Saltos condicionales y control de flujo. |

---

## Guía de Uso

1.  **Editor:** Escribe tu código ensamblador en el panel izquierdo.
2.  **Ensamblar:** Presiona **"🔨 Ensamblar y Simular"**. El sistema limpiará el código, eliminará comentarios y validará la sintaxis.
3.  **Simulación:**
    * Usa **"Paso ➡"** para ver la animación de los bits viajando.
    * Usa **"▶ Auto"** para ver la ejecución fluida.
    * Usa **"🔄 Reset"** para limpiar la memoria y registros y volver a empezar.

---

## Documentación Técnica (Cómo funciona por dentro)

Esta sección detalla la implementación en `script.js` para desarrolladores o estudiantes que deseen replicar o extender el proyecto.

### 1. El Estado del Procesador
Usamos `Int32Array` para simular fielmente el comportamiento de hardware de 32 bits (desbordamientos, signo, etc.).

```javascript
let pc = 0;                             // Program Counter
let registros = new Int32Array(32);     // Banco de Registros (x0 - x31)
let memoriaDatos = new Int32Array(32);  // Memoria RAM
```

### 2. Mapeo Visual (wireMap)
Para desacoplar la lógica matemática de la interfaz gráfica, utilizamos un objeto diccionario llamado `wireMap`. Esto permite controlar múltiples elementos SVG con un solo nombre lógico.

**¿Por qué usarlo?**
Evita tener cientos de llamadas a `document.getElementById` dispersas por el código. Si cambias el ID de un cable en el HTML, solo tienes que actualizarlo aquí.

```javascript
const wireMap = {
    // Control: Relaciona el nombre lógico con el ID del SVG
    'rs1':      { ids: ['wire_rs1'] }, 
    // Cables compuestos: Un solo dato lógico viaja por varios segmentos físicos
    'imm_in_type_s': { ids: ['wire_s_in', 'wire_imm_in_2', 'wire_mux_to_gen'] }
};
```

### 3. El Parser Estricto (`parsearLineaEstricto`)
Implementamos un "tokenizador" basado en **Expresiones Regulares (Regex)** para validar la sintaxis antes de la ejecución. Esto asegura que el código cumpla con la arquitectura RISC-V antes de pasar a la simulación.

* **Validación de Estructura:** Distingue entre formatos estándar (`add x1, x2, x3`) y formatos de memoria (`lw x1, 4(x2)`).
* **Validación Semántica:** Verifica si los operandos son del tipo correcto. Por ejemplo, `addi` exige `Registro, Registro, Inmediato`. Si el usuario ingresa `addi x1, x2, x3`, el parser arrojará error porque `x3` no es un número.

```javascript
// Ejemplo de Regex para instrucciones de Memoria (Load/Store)
const regexMemoria = /^([\w-]+)\s*,\s*(-?[\w]+)\s*\(\s*([\w-]+)\s*\)$/;
// Captura: op1, offset, base
```

### 4. Ciclo de Ejecución (procesarInstruccion)
Esta función actúa como la Unidad de Control del procesador. Se ejecuta en cada ciclo de reloj (o paso de simulación).
Flujo de Datos:

* **Decode:** Recibe la línea de ensamblador y extrae el mnemónico (ej. add, lw).
* **Routing:** Deriva la ejecución a la función especializada correspondiente mediante un sistema de despacho.
* **Error Handling:** Si la instrucción no está soportada o los argumentos son inválidos, detiene la ejecución.

```javascript
if (tipoR.includes(mnemonico)) ejecutarTipoR(mnemonico, partes);
else if (tipoI.includes(mnemonico)) ejecutarTipoI(mnemonico, partes);
// ... resto de tipos
```
### 5. Lógica de Ejecución por Tipo
Cada tipo de instrucción tiene su propia función (ej. ejecutarTipoR, ejecutarTipoB), diseñada para replicar el comportamiento del hardware en 4 fases:

* **Focus Highlighting (resaltarModulosActivos): Enciende visualmente solo los módulos que participan en la operación (ej. en add se enciende la ALU pero se apaga la Memoria de Datos).

* **Cálculo (ALU):** Realiza la operación binaria utilizando operadores de JavaScript (>>>, &, |, +) y actualiza el estado (registros o memoriaDatos).

* **Tooltips:** Asigna valores dinámicos a los cables para que el usuario pueda inspeccionar los datos en binario/hexadecimal al pasar el mouse.

* **Animación (animarSecuencia):**

-- Utiliza setTimeout para simular el retardo de propagación.

-- Ilumina los cables en orden cronológico: Fetch → Decode → Execute → Memory → WriteBack.

## Algoritmos de Prueba
El simulador ha sido validado con los siguientes algoritmos clásicos. Copia estos códigos en el editor para probar la funcionalidad completa.

### 1. Sucesión de Fibonacci
Calcula los primeros 12 números de la serie. Prueba la aritmética básica, el uso de registros como contadores y bucles condicionales.

* **addi x1, x0, 12**     # Límite n=12
* **addi x2, x0, 0**       # Contador actual
* **addi x3, x0, 0**       # F(n-2)
* **addi x4, x0, 1**       # F(n-1)
* **sw x3, 0(x0)**         # Guardar F(0) en RAM
* **sw x4, 4(x0)**         # Guardar F(1) en RAM
* **addi x6, x0, 8**       # Puntero de memoria (inicia en byte 8)
* **addi x2, x2, 2**       # Iniciar contador en 2
* **bge x2, x1, 32**       # Condición de salida: si contador >= 12, saltar al fin
* **add x5, x3, x4**       # F(n) = F(n-1) + F(n-2)
* **sw x5, 0(x6)**         # Guardar F(n) en memoria
* **add x3, x0, x4**       # Actualizar punteros para siguiente iteración
* **add x4, x0, x5**       
* **addi x6, x6, 4**       # Avanzar puntero de memoria
* **addi x2, x2, 1**       # Incrementar contador
* **beq x0, x0, -28**     # Salto incondicional al inicio del bucle
* **beq x0, x0, 0**       # Trap (Fin del programa)

### 2. Conjetura de Collatz
Genera la secuencia de Collatz para el número 6. Este algoritmo pone a prueba la lógica de saltos complejos (Branching) y la manipulación de bits.

* **addi x10, x0, 6**      # Semilla inicial (n=6)
* **addi x11, x0, 1**      # Valor objetivo (1)
* **addi x20, x0, 0**      # Puntero de memoria
* **sw x10, 0(x20)**       # Guardar valor inicial
* **beq x10, x11, 44**     # Si n==1, terminar programa
* **andi x5, x10, 1**      # Verificar paridad (n & 1)
* **bne x5, x0, 12**       # Si es impar, saltar a lógica 3n+1
* **srli x10, x10, 1**     # Si es par: n = n / 2
* **beq x0, x0, 16**       # Saltar paso impar y guardar
* **slli x6, x10, 1**      # Si es impar: n = 3n + 1
* **add x6, x6, x10**      # (n*2) + n = 3n
* **addi x10, x6, 1**      # +1
* **addi x20, x20, 4**     # Avanzar puntero RAM
* **sw x10, 0(x20)**       # Guardar nuevo n
* **beq x0, x0, -40**      # Volver al inicio del bucle
* **beq x0, x0, 0**        # Fin

## Estructura del Proyecto

* **RISC-V.html:** Estructura DOM, Contenedor del Editor, Panel de Control y SVG (Gráficos Vectoriales).

* **style.css:** Estilos Dark Mode, Layout Flexbox/Grid y Clases de Animación (.wire-active).

* **logica.js:** Motor de simulación, Parser Regex, Manejo de Eventos y Lógica de Control.

## Créditos

Desarrollado como proyecto final de Arquitectura de Computadoras.

* **Lógica y Desarrollo:** Flores Canseco Joe Anthony, Vidals Sibaja Sinuhe, Peralta Segoviano Jairo Havith y Betanzo Bolaños Samantha

* **Tecnologías:** HTML5, CSS3, JavaScript (Vanilla ES6).

"El software nunca se termina, solo se libera."