const GRAVEDAD = 9.81;
let chartInstance = null;
let ultimoReporte = null;

// Elementos del DOM
const form = document.getElementById('calc-form');
const selectGeometria = document.getElementById('geometria');
const selectMetodo = document.getElementById('metodo');
const selectFluido = document.getElementById('fluido-preset');
const inputDensidad = document.getElementById('densidad');
const inputRadio = document.getElementById('radio');
const inputAltura = document.getElementById('altura');
const inputNivel = document.getElementById('nivel');
const inputSubintervalos = document.getElementById('subintervalos');
const alertBox = document.getElementById('alert-box');

// Sincronizar selector de fluido con el input de densidad
selectFluido.addEventListener('change', () => {
    if (selectFluido.value !== 'custom') {
        inputDensidad.value = selectFluido.value;
    } else {
        inputDensidad.focus();
    }
});

inputDensidad.addEventListener('input', () => {
    selectFluido.value = 'custom';
});

// Actualizar geometría visual del tanque al cambiar opción
selectGeometria.addEventListener('change', actualizarVisualizadorTanque);

// ==========================================
// 1. Validación Estricta de Entradas
// ==========================================
function mostrarError(mensaje, inputElement = null) {
    alertBox.textContent = mensaje;
    alertBox.classList.remove('hidden');
    if (inputElement) {
        inputElement.classList.add('input-error');
        setTimeout(() => inputElement.classList.remove('input-error'), 600);
        inputElement.focus();
    }
}

function ocultarError() {
    alertBox.classList.add('hidden');
}

function validarEntradas() {
    ocultarError();

    const campos = [
        { el: inputDensidad, nombre: 'Densidad (ρ)' },
        { el: inputRadio, nombre: 'Radio (R)' },
        { el: inputAltura, nombre: 'Altura del tanque (H)' },
        { el: inputNivel, nombre: 'Nivel del líquido (h)' },
        { el: inputSubintervalos, nombre: 'Subintervalos (n)' }
    ];

    for (let campo of campos) {
        const valStr = campo.el.value.trim();
        if (valStr === '' || isNaN(Number(valStr))) {
            mostrarError(`Error en ${campo.nombre}: Debes ingresar un valor numérico válido (sin letras ni campos vacíos).`, campo.el);
            return null;
        }
        const val = Number(valStr);
        if (val <= 0) {
            mostrarError(`Error en ${campo.nombre}: El valor debe ser estrictamente mayor a cero para evitar valores negativos o divisiones entre cero.`, campo.el);
            return null;
        }
    }

    const rho = parseFloat(inputDensidad.value);
    const R = parseFloat(inputRadio.value);
    const H = parseFloat(inputAltura.value);
    const h = parseFloat(inputNivel.value);
    const n = parseFloat(inputSubintervalos.value);
    const metodo = selectMetodo.value;

    if (h > H) {
        mostrarError('Error físico: El nivel del líquido (h) no puede superar la altura total del tanque (H).', inputNivel);
        return null;
    }

    if (!Number.isInteger(n)) {
        mostrarError('Error en Subintervalos (n): Debe ser un número entero exacto.', inputSubintervalos);
        return null;
    }

    if (metodo === 'simpson' && n % 2 !== 0) {
        mostrarError('Requerimiento de Simpson 1/3: El número de subintervalos (n) debe ser estrictamente PAR.', inputSubintervalos);
        return null;
    }

    return {
        geometria: selectGeometria.value,
        metodo,
        rho,
        R,
        H,
        h,
        n
    };
}

// ==========================================
// 2. Motor de Cálculo Numérico y Analítico
// ==========================================
function radioEnAltura(y, R, H, geometria) {
    if (geometria === 'cilindro') return R;
    // Cono con vértice en y = 0: r(y) = (R / H) * y
    return (R / H) * y;
}

function diferencialTrabajo(y, params) {
    const r_y = radioEnAltura(y, params.R, params.H, params.geometria);
    const area = Math.PI * Math.pow(r_y, 2);
    const distancia = params.H - y;
    return params.rho * GRAVEDAD * area * distancia;
}

function ejecutarIntegracion(params) {
    const { h, n, metodo } = params;
    const paso = h / n; // dy = (h - 0) / n (n > 0 validado previamente)
    let suma = 0;
    const iteraciones = [];

    for (let i = 0; i <= n; i++) {
        const y = i * paso;
        const r_y = radioEnAltura(y, params.R, params.H, params.geometria);
        const distancia = params.H - y;
        const f_y = diferencialTrabajo(y, params);

        let coef = 1;
        if (metodo === 'simpson') {
            if (i === 0 || i === n) coef = 1;
            else if (i % 2 !== 0) coef = 4;
            else coef = 2;
        } else {
            // Regla del Trapecio
            coef = (i === 0 || i === n) ? 1 : 2;
        }

        const termino = coef * f_y;
        suma += termino;

        iteraciones.push({
            i,
            y,
            r_y,
            distancia,
            f_y,
            coef,
            termino
        });
    }

    const trabajoNumerico = metodo === 'simpson'
        ? (paso / 3) * suma
        : (paso / 2) * suma;

    return { trabajoNumerico, iteraciones };
}

function calcularAnaliticoExacto(params) {
    const { rho, R, H, h, geometria } = params;
    if (geometria === 'cilindro') {
        // Integral de 0 a h de: rho * g * pi * R^2 * (H - y) dy
        return rho * GRAVEDAD * Math.PI * Math.pow(R, 2) * (H * h - Math.pow(h, 2) / 2);
    } else {
        // Cono: Integral de 0 a h de: rho * g * pi * (R^2 / H^2) * (H*y^2 - y^3) dy
        const constante = rho * GRAVEDAD * Math.PI * (Math.pow(R, 2) / Math.pow(H, 2));
        return constante * ((H * Math.pow(h, 3)) / 3 - Math.pow(h, 4) / 4);
    }
}

// ==========================================
// 3. Renderizado Visual, Gráfica y Animación
// ==========================================
function actualizarVisualizadorTanque() {
    const H = parseFloat(inputAltura.value) || 1;
    const h = parseFloat(inputNivel.value) || 0;
    const porcentaje = Math.min(100, Math.max(0, (h / H) * 100));

    const tankShape = document.getElementById('tank-shape');
    const liquidLevel = document.getElementById('liquid-level');
    const tankLabel = document.getElementById('tank-label');

    tankShape.className = selectGeometria.value === 'cilindro' ? 'tank-cylinder' : 'tank-cone';
    liquidLevel.style.height = `${porcentaje}%`;
    tankLabel.textContent = `h = ${h.toFixed(2)}m / H = ${H.toFixed(2)}m (${porcentaje.toFixed(0)}%)`;
}

function renderizarGrafica(iteraciones, params) {
    const ctx = document.getElementById('workChart').getContext('2d');
    const labels = iteraciones.map(item => `${item.y.toFixed(2)} m`);
    const dataPoints = iteraciones.map(item => (item.f_y / 1000).toFixed(3)); // En kN para legibilidad

    if (chartInstance) {
        chartInstance.destroy();
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(14, 165, 233, 0.45)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.02)');

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'dW/dy (kJ/m)',
                data: dataPoints,
                borderColor: '#38bdf8',
                backgroundColor: gradient,
                borderWidth: 2.5,
                pointBackgroundColor: '#090d16',
                pointBorderColor: '#38bdf8',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: params.geometria === 'cilindro' ? 0.05 : 0.35
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#94a3b8',
                    bodyColor: '#f8fafc',
                    borderColor: 'rgba(56, 189, 248, 0.3)',
                    borderWidth: 1,
                    padding: 10
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Altura del fluido y (m)', color: '#64748b', font: { size: 11 } },
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#94a3b8', font: { size: 11 } }
                },
                y: {
                    title: { display: true, text: 'Trabajo diferencial (kJ/m)', color: '#64748b', font: { size: 11 } },
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#94a3b8', font: { size: 11 } },
                    beginAtZero: true
                }
            }
        }
    });
}

function renderizarTabla(iteraciones) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    iteraciones.forEach(fila => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${fila.i}</td>
            <td>${fila.y.toFixed(4)}</td>
            <td>${fila.r_y.toFixed(4)}</td>
            <td>${fila.distancia.toFixed(4)}</td>
            <td>${fila.f_y.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>${fila.coef}</td>
            <td>${fila.termino.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 4. Persistencia y Exportación (.CSV y .TXT)
// ==========================================
function descargarArchivo(contenido, nombreArchivo, mimeType) {
    const blob = new Blob([contenido], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

document.getElementById('btn-csv').addEventListener('click', () => {
    if (!ultimoReporte) return;
    const { params, trabajoNumerico, trabajoAnalitico, errorPorcentual, iteraciones } = ultimoReporte;

    let csv = '\uFEFF'; // BOM para que Excel reconozca acentos
    csv += 'REPORTE DE TRABAJO MECANICO EN BOMBEO HIDRAULICO\n';
    csv += `Geometria,${params.geometria.toUpperCase()}\n`;
    csv += `Metodo Numerico,${params.metodo === 'simpson' ? 'Simpson 1/3' : 'Trapecio'}\n`;
    csv += `Densidad (kg/m3),${params.rho}\n`;
    csv += `Radio R (m),${params.R},Altura H (m),${params.H},Nivel h (m),${params.h},Subintervalos n,${params.n}\n\n`;

    csv += 'Iteracion (i),Altura y_i (m),Radio r(y_i) (m),Distancia Bombeo (m),f(y_i) [N],Coeficiente,Termino\n';
    iteraciones.forEach(it => {
        csv += `${it.i},${it.y.toFixed(4)},${it.r_y.toFixed(4)},${it.distancia.toFixed(4)},${it.f_y.toFixed(4)},${it.coef},${it.termino.toFixed(4)}\n`;
    });

    csv += `\nTrabajo Numerico (Joules),${trabajoNumerico.toFixed(4)}\n`;
    csv += `Trabajo Analitico Exacto (Joules),${trabajoAnalitico.toFixed(4)}\n`;
    csv += `Error Relativo Porcentual (%),${errorPorcentual.toFixed(8)}\n`;

    descargarArchivo(csv, `reporte_bombeo_${params.geometria}.csv`, 'text/csv;charset=utf-8;');
});

document.getElementById('btn-txt').addEventListener('click', () => {
    if (!ultimoReporte) return;
    const { params, trabajoNumerico, trabajoAnalitico, errorPorcentual, iteraciones } = ultimoReporte;

    let txt = '========================================================================\n';
    txt += '        REPORTE TÉCNICO: TRABAJO MECÁNICO DE BOMBEO HIDRÁULICO          \n';
    txt += '========================================================================\n\n';
    txt += `Geometría del Tanque : ${params.geometria.toUpperCase()}\n`;
    txt += `Método de Integración: ${params.metodo === 'simpson' ? 'Regla de Simpson 1/3' : 'Regla del Trapecio'}\n`;
    txt += `Densidad del Fluido  : ${params.rho} kg/m³\n`;
    txt += `Dimensiones          : R = ${params.R} m | H = ${params.H} m | Nivel h = ${params.h} m\n`;
    txt += `Subintervalos (n)    : ${params.n}\n\n`;

    txt += '------------------------------------------------------------------------\n';
    txt += ' i   |   y_i (m)  |  r(y_i)  | Dist (m) |    f(y_i)     | Coef |   Término\n';
    txt += '------------------------------------------------------------------------\n';
    iteraciones.forEach(it => {
        txt += `${String(it.i).padEnd(4)} | ${it.y.toFixed(4).padStart(10)} | ${it.r_y.toFixed(4).padStart(8)} | ${it.distancia.toFixed(4).padStart(8)} | ${it.f_y.toFixed(2).padStart(13)} | ${String(it.coef).padStart(4)} | ${it.termino.toFixed(2).padStart(13)}\n`;
    });

    txt += '------------------------------------------------------------------------\n\n';
    txt += `TRABAJO NUMÉRICO APROXIMADO : ${trabajoNumerico.toLocaleString('en-US', { minimumFractionDigits: 4 })} Joules\n`;
    txt += `TRABAJO ANALÍTICO EXACTO    : ${trabajoAnalitico.toLocaleString('en-US', { minimumFractionDigits: 4 })} Joules\n`;
    txt += `ERROR RELATIVO PORCENTUAL   : ${errorPorcentual.toFixed(8)} %\n`;

    descargarArchivo(txt, `reporte_bombeo_${params.geometria}.txt`, 'text/plain;charset=utf-8;');
});

// ==========================================
// 5. Controlador Principal
// ==========================================
function procesarSimulacion(e) {
    if (e) e.preventDefault();

    const params = validarEntradas();
    if (!params) return;

    actualizarVisualizadorTanque();

    const { trabajoNumerico, iteraciones } = ejecutarIntegracion(params);
    const trabajoAnalitico = calcularAnaliticoExacto(params);
    const errorPorcentual = Math.abs((trabajoAnalitico - trabajoNumerico) / trabajoAnalitico) * 100;

    // Actualizar etiquetas e interfaz
    document.getElementById('label-num').textContent = 
        `Trabajo Numérico (${params.metodo === 'simpson' ? 'Simpson 1/3' : 'Trapecio'})`;

    document.getElementById('res-numerico').textContent = `${(trabajoNumerico / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kJ`;
    document.getElementById('res-joules-num').textContent = `${trabajoNumerico.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Joules`;

    document.getElementById('res-analitico').textContent = `${(trabajoAnalitico / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kJ`;
    document.getElementById('res-joules-ana').textContent = `${trabajoAnalitico.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Joules`;

    document.getElementById('res-error').textContent = `${errorPorcentual.toFixed(6)} %`;

    renderizarGrafica(iteraciones, params);
    renderizarTabla(iteraciones);

    ultimoReporte = { params, trabajoNumerico, trabajoAnalitico, errorPorcentual, iteraciones };
}

form.addEventListener('submit', procesarSimulacion);

// Ejecutar cálculo inicial al cargar la página
window.addEventListener('DOMContentLoaded', () => {
    procesarSimulacion();
});