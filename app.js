// Configuración de Day.js
if (typeof dayjs === 'undefined') { window.dayjs = function() { return { format: () => '2026-08', add: () => window.dayjs(), subtract: () => window.dayjs(), daysInMonth: () => 31, startOf: () => window.dayjs(), day: () => 1 }; }; window.dayjs.locale = function(){}; }
dayjs.locale('es');

const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Estado Global de la App
const getLS = (k, d) => { try { const i = localStorage.getItem(k); return i ? JSON.parse(i) : d; } catch(e) { return d; } };
const state = {
    trabajadores: getLS('trabajadores', []),
    obras: getLS('obras', []),
    asistencia: getLS('asistencia', {}),
    adelantos: getLS('adelantos', {}),
    notas: getLS('notas', {}),
    feriados: {
        "2026-01-01": "Año Nuevo",
        "2026-04-03": "Viernes Santo",
        "2026-04-04": "Sábado Santo",
        "2026-05-01": "Día del Trabajo",
        "2026-05-21": "Glorias Navales",
        "2026-06-21": "Pueblos Indígenas",
        "2026-06-29": "San Pedro y San Pablo",
        "2026-07-16": "Virgen del Carmen",
        "2026-08-15": "Asunción de la Virgen",
        "2026-09-18": "Independencia Nacional",
        "2026-09-19": "Glorias del Ejército",
        "2026-10-12": "Encuentro de Dos Mundos",
        "2026-10-31": "Iglesias Evangélicas",
        "2026-11-01": "Todos los Santos",
        "2026-12-08": "Inmaculada Concepción",
        "2026-12-25": "Navidad"
    },
    currentMesAsistencia: dayjs(),
    currentMesReporte: dayjs(),
    trabajadorSeleccionadoAsistencia: null
};

// Utilidades para formatear moneda
const formatoMoneda = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
});

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCWXglZgC6iuNk2BFuO4-vFX44hSTeDnWY",
  authDomain: "asistenciaapp-d23b0.firebaseapp.com",
  projectId: "asistenciaapp-d23b0",
  storageBucket: "asistenciaapp-d23b0.firebasestorage.app",
  messagingSenderId: "1097482562782",
  appId: "1:1097482562782:web:aa1ac1a9a32f2dda83264f"
};
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
}
const db = typeof firebase !== 'undefined' ? firebase.firestore() : null;

// App Controller
const app = {
    init: function() {
        const urlParams = new URLSearchParams(window.location.search);
        const wId = urlParams.get('worker');
        const m = parseInt(urlParams.get('m'));
        const y = parseInt(urlParams.get('y'));
        const oldLink = urlParams.get('resumen');
        
        if (wId && m && y && db) {
            document.querySelector('.app-container').style.display = 'none';
            document.getElementById('worker-viewer').style.display = 'block';
            this.setupWorkerLiveViewer(wId, m, y);
            return;
        } else if (oldLink) {
            document.querySelector('.app-container').style.display = 'none';
            document.getElementById('worker-viewer').style.display = 'block';
            this.renderWorkerSummaryStatic(oldLink);
            return;
        }

        try { this.loadData(); } catch(e) { console.error("Error en loadData:", e); }
        try { this.setupNavigation(); } catch(e) { console.error("Error en setupNavigation:", e); }
        
        // Configurar menú móvil
        const menuBtn = document.getElementById('mobile-menu-btn');
        const sidebar = document.getElementById('sidebar');
        if(menuBtn && sidebar) {
            // Cerrar sidebar si se hace clic fuera en modo móvil
            document.addEventListener('click', (e) => {
                if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
                    sidebar.classList.remove('sidebar-open');
                }
            });
        }

        // Migración de datos antiguos: Adelantos mensuales a diarios
        try {
            if (state.adelantos) {
                let migrated = false;
                Object.keys(state.adelantos).forEach(mes => {
                    Object.keys(state.adelantos[mes]).forEach(tId => {
                        if (typeof state.adelantos[mes][tId] === 'number' || typeof state.adelantos[mes][tId] === 'string') {
                            const monto = parseInt(state.adelantos[mes][tId]);
                            state.adelantos[mes][tId] = {};
                            if (monto > 0) {
                                const primerDia = `${mes}-01`;
                                state.adelantos[mes][tId][primerDia] = {
                                    monto: monto,
                                    timestamp: dayjs().format('DD/MM/YYYY HH:mm')
                                };
                            }
                            migrated = true;
                        }
                    });
                });
                if (migrated) this.guardarDatos('adelantos', state.adelantos);
            }
        } catch(e) { console.error("Error migrating adelantos", e); }

        // Renderizar vistas iniciales
        try { this.renderTrabajadores(); } catch(e) { console.error(e); }
        try { this.renderObras(); } catch(e) { console.error(e); }
        try { this.updateSelects(); } catch(e) { console.error(e); }
        try { this.updateDashboard(); } catch(e) { console.error(e); }
    },

    loadData: function() {
        const fields = ['trabajadores', 'obras', 'asistencia', 'adelantos', 'notas', 'feriados'];
        let hasLocalData = false;
        fields.forEach(f => {
            const data = localStorage.getItem(f);
            if (data) {
                state[f] = JSON.parse(data);
                if (f === 'trabajadores' && state.trabajadores.length > 0) hasLocalData = true;
            }
        });

        if (db) {
            db.collection('appData').doc('estado').onSnapshot(doc => {
                if (doc.exists) {
                    const cloudData = doc.data();
                    state.trabajadores = cloudData.trabajadores || [];
                    state.obras = cloudData.obras || [];
                    state.asistencia = cloudData.asistencia || {};
                    state.adelantos = cloudData.adelantos || {};
                    state.notas = cloudData.notas || {};
                    state.feriados = cloudData.feriados || {};

                    this.updateSelects();
                    this.updateDashboard();
                    this.renderTrabajadores();
                    this.renderObras();
                    if (state.currentTrabajadorAsistencia) this.renderCalendario(state.currentTrabajadorAsistencia, state.currentMes, state.currentYear);
                    
                    fields.forEach(f => localStorage.setItem(f, JSON.stringify(state[f])));
                } else if (hasLocalData) {
                    db.collection('appData').doc('estado').set({
                        trabajadores: state.trabajadores,
                        obras: state.obras,
                        asistencia: state.asistencia,
                        adelantos: state.adelantos,
                        notas: state.notas,
                        feriados: state.feriados
                    }).catch(console.error);
                }
            }, err => {
                console.error("Firebase listen error: ", err);
            });
        }
    },

    // --- Navegación ---
    setupNavigation: function() {
        const navItems = document.querySelectorAll('.nav-item');
        const views = document.querySelectorAll('.view-section');

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                // Quitar active de navs
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');

                // Mostrar vista
                const targetId = item.getAttribute('data-target');
                views.forEach(view => {
                    if (view.id === targetId) {
                        view.classList.add('active');
                        // Actualizar datos si es necesario al entrar a la vista
                        try {
                            if(targetId === 'dashboard') this.updateDashboard();
                            if(targetId === 'asistencia') this.renderCalendario();
                            if(targetId === 'view-reportes') this.renderReporte();
                        } catch(e) { console.error("Error al actualizar vista:", e); }
                    } else {
                        view.classList.remove('active');
                    }
                });
                
                // Cerrar sidebar en móviles tras hacer clic
                if (window.innerWidth <= 768) {
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar) sidebar.classList.remove('sidebar-open');
                }
            });
        });
    },

    // --- Modales ---
    abrirModal: function(modalId, idToEdit = null) {
        const modal = document.getElementById(modalId);
        modal.classList.add('active');
        
        // Limpiar form
        const form = modal.querySelector('form');
        if (form) form.reset();

        // Si es edición de trabajador
        if (modalId === 'modal-trabajador' && idToEdit) {
            const t = state.trabajadores.find(x => x.id === idToEdit);
            if (t) {
                document.getElementById('titulo-modal-trabajador').innerText = "Editar Trabajador";
                document.getElementById('trabajador-id').value = t.id;
                document.getElementById('trabajador-nombre').value = t.nombre;
                document.getElementById('trabajador-rut').value = t.rut;
                document.getElementById('trabajador-especialidad').value = t.especialidad;
                document.getElementById('trabajador-sueldo').value = t.sueldo;
            }
        } else if (modalId === 'modal-trabajador') {
            document.getElementById('titulo-modal-trabajador').innerText = "Nuevo Trabajador";
            document.getElementById('trabajador-id').value = "";
        }

        // Si es edición de obra
        if (modalId === 'modal-obra' && idToEdit) {
            const o = state.obras.find(x => x.id === idToEdit);
            if (o) {
                document.getElementById('titulo-modal-obra').innerText = "Editar Obra";
                document.getElementById('obra-id').value = o.id;
                document.getElementById('obra-nombre').value = o.nombre;
                document.getElementById('obra-direccion').value = o.direccion;
                document.getElementById('obra-estado').value = o.estado;
            }
        } else if (modalId === 'modal-obra') {
            document.getElementById('titulo-modal-obra').innerText = "Nueva Obra";
            document.getElementById('obra-id').value = "";
        }
    },

    cerrarModal: function(modalId) {
        document.getElementById(modalId).classList.remove('active');
    },

    // --- Trabajadores ---
    guardarTrabajador: function(e) {
        e.preventDefault();
        const id = document.getElementById('trabajador-id').value;
        const nombre = document.getElementById('trabajador-nombre').value;
        const rut = document.getElementById('trabajador-rut').value;
        const especialidad = document.getElementById('trabajador-especialidad').value;
        const sueldo = parseInt(document.getElementById('trabajador-sueldo').value);

        if (id) {
            // Editar
            const index = state.trabajadores.findIndex(x => x.id === id);
            if (index > -1) {
                state.trabajadores[index] = { id, nombre, rut, especialidad, sueldo };
            }
        } else {
            // Nuevo
            const nuevoId = 't_' + Date.now();
            state.trabajadores.push({ id: nuevoId, nombre, rut, especialidad, sueldo });
        }

        this.guardarDatos('trabajadores', state.trabajadores);
        this.renderTrabajadores();
        this.updateSelects();
        this.cerrarModal('modal-trabajador');
    },

    eliminarTrabajador: function(id) {
        if (confirm("¿Estás seguro de eliminar este trabajador? Se mantendrá su registro de asistencia histórico pero no se podrá asignar a nuevas obras.")) {
            state.trabajadores = state.trabajadores.filter(x => x.id !== id);
            this.guardarDatos('trabajadores', state.trabajadores);
            this.renderTrabajadores();
            this.updateSelects();
        }
    },

    cambiarFeriado: function(dia) {
        if (!state.currentMes || !state.currentYear) return;
        const key = `${state.currentYear}-${state.currentMes}`;
        if (!state.feriados[key]) state.feriados[key] = {};
        
        const actual = state.feriados[key][dia] || '';
        const nuevo = prompt(`Ingrese el nombre del feriado para el día ${dia} (Deje en blanco para eliminar):`, actual);
        
        if (nuevo !== null) {
            if (nuevo.trim() === '') {
                delete state.feriados[key][dia];
            } else {
                state.feriados[key][dia] = nuevo.trim();
            }
            this.guardarDatos('feriados', state.feriados);
            if (state.currentTrabajadorAsistencia) {
                this.renderCalendario(state.currentTrabajadorAsistencia, state.currentMes, state.currentYear);
            }
        }
    },

    // --- WORKER VIEWER & SHARING ---
    compartirResumen: function() {
        if (!state.currentTrabajadorAsistencia || !state.currentMesAsistencia) return;
        
        const trabajador = state.trabajadores.find(t => t.id === state.currentTrabajadorAsistencia);
        if (!trabajador) return;

        const dateKey = state.currentMesAsistencia.format('YYYY-MM');
        const m = state.currentMesAsistencia.month() + 1;
        const y = state.currentMesAsistencia.year();

        const data = {
            t: { n: trabajador.nombre, r: trabajador.rut, s: trabajador.sueldo },
            m: m,
            y: y,
            a: (state.asistencia[dateKey] || {})[state.currentTrabajadorAsistencia] || {},
            ad: (state.adelantos[dateKey] || {})[state.currentTrabajadorAsistencia] || {},
            n: (state.notas[dateKey] || {})[state.currentTrabajadorAsistencia] || {},
            f: state.feriados[dateKey] || {}
        };

        const text = `Hola ${trabajador.nombre}, aquí puedes ver en vivo tu resumen de asistencia de ${meses[m - 1]} ${y}.`;
        let url = '';
        if (typeof db !== 'undefined' && db) {
            url = `${window.location.origin}${window.location.pathname}?worker=${trabajador.id}&m=${m}&y=${y}`;
        } else {
            const base64Data = btoa(encodeURIComponent(JSON.stringify(data)));
            url = `${window.location.origin}${window.location.pathname}?resumen=${base64Data}`;
        }

        if (navigator.share) {
            navigator.share({
                title: 'Resumen de Asistencia',
                text: text,
                url: url
            }).catch(err => {
                console.error("Error compartiendo:", err);
                prompt('Copia este enlace para compartir el resumen:', url);
            });
        } else {
            prompt('Copia este enlace para compartir el resumen:', url);
        }
    },

    setupWorkerLiveViewer: function(wId, m, y) {
        db.collection('appData').doc('estado').onSnapshot(doc => {
            if (doc.exists) {
                const cloudData = doc.data();
                window.currentWorkerCloudData = cloudData;
                window.currentWorkerId = wId;
                
                const dateKey = `${y}-${String(m).padStart(2, '0')}`;
                const trabajador = (cloudData.trabajadores || []).find(t => t.id === wId);
                
                if (!trabajador) {
                    document.body.innerHTML = "<h2 style='text-align:center; padding: 50px; color:white;'>Trabajador no encontrado.</h2>";
                    return;
                }

                // Generar opciones de meses (buscar todos los meses donde el trabajador tiene asistencia o adelantos, más el actual)
                const selector = document.getElementById('wv-mes-selector');
                selector.innerHTML = '';
                const mesesDisponibles = new Set();
                mesesDisponibles.add(dateKey); // Siempre añadir el mes pedido
                
                if(cloudData.asistencia) {
                    Object.keys(cloudData.asistencia).forEach(mk => {
                        if (cloudData.asistencia[mk][wId]) mesesDisponibles.add(mk);
                    });
                }
                if(cloudData.adelantos) {
                    Object.keys(cloudData.adelantos).forEach(mk => {
                        if (cloudData.adelantos[mk][wId]) mesesDisponibles.add(mk);
                    });
                }
                
                Array.from(mesesDisponibles).sort().reverse().forEach(mk => {
                    const [yy, mm] = mk.split('-');
                    const nombreMes = meses[parseInt(mm) - 1];
                    const opt = document.createElement('option');
                    opt.value = mk;
                    opt.innerText = `${nombreMes} ${yy}`;
                    if (mk === dateKey) opt.selected = true;
                    selector.appendChild(opt);
                });

                const data = {
                    t: { n: trabajador.nombre, r: trabajador.rut, s: trabajador.sueldo },
                    m: parseInt(m),
                    y: parseInt(y),
                    a: (cloudData.asistencia || {})[dateKey]?.[wId] || {},
                    ad: (cloudData.adelantos || {})[dateKey]?.[wId] || {},
                    n: (cloudData.notas || {})[dateKey]?.[wId] || {},
                    f: (cloudData.feriados || {})[dateKey] || {},
                    o: cloudData.obras || []
                };
                
                this.renderWorkerDOM(data);
            }
        });
    },
    
    cambiarMesWorker: function(mesKey) {
        const [y, m] = mesKey.split('-');
        const cloudData = window.currentWorkerCloudData;
        const wId = window.currentWorkerId;
        const trabajador = (cloudData.trabajadores || []).find(t => t.id === wId);
        
        const data = {
            t: { n: trabajador.nombre, r: trabajador.rut, s: trabajador.sueldo },
            m: parseInt(m),
            y: parseInt(y),
            a: (cloudData.asistencia || {})[mesKey]?.[wId] || {},
            ad: (cloudData.adelantos || {})[mesKey]?.[wId] || {},
            n: (cloudData.notas || {})[mesKey]?.[wId] || {},
            f: (cloudData.feriados || {})[mesKey] || {},
            o: cloudData.obras || []
        };
        this.renderWorkerDOM(data);
    },

    renderWorkerSummaryStatic: function(base64Data) {
        try {
            const data = JSON.parse(decodeURIComponent(atob(base64Data)));
            this.renderWorkerDOM(data);
        } catch (e) {
            console.error("Link inválido", e);
            document.body.innerHTML = "<h2 style='text-align:center; padding: 50px; color:white;'>El enlace es inválido o está dañado.</h2>";
        }
    },

    renderWorkerDOM: function(data) {
        try {
            document.getElementById('wv-nombre').innerText = data.t.n;
            document.getElementById('wv-rut').innerText = data.t.r;
            // wv-mes se quitó del HTML
            document.getElementById('wv-sueldo-base').innerText = `Basado en ${formatoMoneda.format(data.t.s)} / día`;

            let diasAsistidos = Object.keys(data.a).length;
            let totalAdelantos = 0;
            
            Object.values(data.ad).forEach(adelanto => {
                totalAdelantos += adelanto.monto;
            });

            const totalBruto = diasAsistidos * data.t.s;
            const totalPagar = totalBruto - totalAdelantos;

            document.getElementById('wv-dias').innerText = diasAsistidos;
            document.getElementById('wv-adelantos').innerText = formatoMoneda.format(totalAdelantos);
            document.getElementById('wv-total').innerText = formatoMoneda.format(totalPagar);

            const wvCalendar = document.getElementById('wv-calendar');
            wvCalendar.innerHTML = '';
            
            const diasMes = new Date(data.y, data.m, 0).getDate();
            const primerDia = new Date(data.y, data.m - 1, 1).getDay();
            const startDay = primerDia === 0 ? 6 : primerDia - 1;

            const diasSemana = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];
            wvCalendar.innerHTML += `<div class="cal-header-cell">W</div>`;
            diasSemana.forEach(d => {
                wvCalendar.innerHTML += `<div class="cal-header-cell">${d}</div>`;
            });

            let weekCounter = 1;
            let rowLength = 0;

            for (let i = 0; i < startDay; i++) {
                if (i === 0) wvCalendar.innerHTML += `<div class="week-num-cell">${weekCounter}</div>`;
                wvCalendar.innerHTML += `<div class="day-cell-empty"></div>`;
                rowLength++;
            }

            for (let i = 1; i <= diasMes; i++) {
                if (rowLength === 0) {
                    wvCalendar.innerHTML += `<div class="week-num-cell">${weekCounter}</div>`;
                }

                const dKey = `${data.y}-${String(data.m).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                const isFeriado = data.f[i.toString()];
                const hasAsist = !!data.a[dKey];
                const hasNota = !!data.n[dKey];

                const cell = document.createElement('div');
                cell.className = 'day-cell wv-day-cell';
                if (hasAsist) cell.classList.add('asistio');

                let html = `<span class="day-number">${i}</span>`;
                if (isFeriado) html += `<div class="feriado-text">${isFeriado}</div>`;
                if (hasAsist) {
                    const obraId = data.a[dKey];
                    const obra = (data.o || []).find(ob => ob.id === obraId);
                    const obraNombre = obra ? obra.nombre : 'Obra';
                    html += `<div class="day-obra" style="font-size: 0.65rem; color: rgba(255,255,255,0.9); background: rgba(255,255,255,0.15); border-radius: 4px; padding: 2px 4px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1;">${obraNombre}</div>`;
                }
                
                if (hasNota) html += `<i class="ph-fill ph-chat-text note-indicator" style="position: absolute; top: 4px; right: 4px; color: #eab308; font-size: 1rem;"></i>`;
                
                cell.innerHTML = html;
                wvCalendar.appendChild(cell);

                rowLength++;
                if (rowLength === 7) {
                    rowLength = 0;
                    weekCounter++;
                }
            }

            while (rowLength > 0 && rowLength < 7) {
                wvCalendar.innerHTML += `<div class="day-cell-empty"></div>`;
                rowLength++;
            }

            const notasContainer = document.getElementById('wv-notas-container');
            const notasList = document.getElementById('wv-notas-list');
            
            const notasKeys = Object.keys(data.n);
            if (notasKeys.length > 0) {
                notasContainer.style.display = 'block';
                notasList.innerHTML = '';
                notasKeys.forEach(dKey => {
                    const el = document.createElement('div');
                    el.style.cssText = 'background: rgba(255,255,255,0.03); padding: 10px; border-radius: 6px; font-size: 0.85rem;';
                    const dia = parseInt(dKey.split('-')[2]);
                    el.innerHTML = `<strong style="color:var(--text-main); display:block; margin-bottom:3px;">Día ${dia}</strong><span style="color:var(--text-muted);">${data.n[dKey]}</span>`;
                    notasList.appendChild(el);
                });
            } else {
                notasContainer.style.display = 'none';
            }

        } catch (e) {
            console.error("Link inválido", e);
            document.body.innerHTML = "<h2 style='text-align:center; padding: 50px; color:white;'>El enlace es inválido o está dañado.</h2>";
        }
    },

    cambiarTrabajadorAsistencia: function() {
        const select = document.getElementById('select-trabajador-asistencia');
        const shareBtn = document.getElementById('btn-share-resumen');
        state.currentTrabajadorAsistencia = select.value;
        if(state.currentTrabajadorAsistencia) {
            this.renderCalendario();
            if (shareBtn) shareBtn.style.display = 'flex';
        } else {
            document.getElementById('calendario-asistencia').innerHTML = '';
            document.getElementById('pago-acumulado-mes').innerText = '$0';
            document.getElementById('adelantos-mes-badge').innerText = '$0';
            if (shareBtn) shareBtn.style.display = 'none';
        }
    },

    renderTrabajadores: function() {
        const tbody = document.getElementById('tabla-trabajadores-body');
        tbody.innerHTML = '';
        
        if (state.trabajadores.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-state-cell" style="text-align:center; color: var(--text-muted);">No hay trabajadores registrados</td></tr>`;
            return;
        }

        state.trabajadores.forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Nombre Completo"><strong>${t.nombre}</strong></td>
                <td data-label="RUT">${t.rut}</td>
                <td data-label="Especialidad">${t.especialidad}</td>
                <td data-label="Sueldo Diario" style="color: var(--success); font-weight: 600;">${formatoMoneda.format(t.sueldo)}</td>
                <td data-label="Acciones">
                    <button class="icon-btn" onclick="app.abrirModal('modal-trabajador', '${t.id}')"><i class="ph ph-pencil-simple"></i></button>
                    <button class="icon-btn" style="color: var(--danger)" onclick="app.eliminarTrabajador('${t.id}')"><i class="ph ph-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    // --- Obras ---
    guardarObra: function(e) {
        e.preventDefault();
        const id = document.getElementById('obra-id').value;
        const nombre = document.getElementById('obra-nombre').value;
        const direccion = document.getElementById('obra-direccion').value;
        const estado = document.getElementById('obra-estado').value;

        if (id) {
            // Editar
            const index = state.obras.findIndex(x => x.id === id);
            if (index > -1) {
                state.obras[index] = { id, nombre, direccion, estado };
            }
        } else {
            // Nueva
            const nuevoId = 'o_' + Date.now();
            state.obras.push({ id: nuevoId, nombre, direccion, estado });
        }

        this.guardarDatos('obras', state.obras);
        this.renderObras();
        this.updateSelects();
        this.cerrarModal('modal-obra');
    },

    eliminarObra: function(id) {
        if(confirm("¿Estás seguro de eliminar esta obra?")) {
            state.obras = state.obras.filter(o => o.id !== id);
            this.guardarDatos('obras', state.obras);
            this.renderObras();
            this.updateSelects();
            this.updateDashboard();
        }
    },

    // --- Reportes ---
    cambiarMesReporte: function(delta) {
        state.currentMesAsistencia = state.currentMesAsistencia.add(delta, 'month');
        this.renderReporte();
        this.updateDashboard();
        this.renderCalendario();
    },

    renderReporte: function() {
        const mesTexto = state.currentMesAsistencia.format('MMMM YYYY');
        document.getElementById('mes-reporte-actual').innerText = mesTexto.charAt(0).toUpperCase() + mesTexto.slice(1);
        document.getElementById('report-print-date').innerText = "Generado el: " + dayjs().format('DD/MM/YYYY HH:mm');

        const tipoSelect = document.getElementById('tipo-reporte');
        const obraSelect = document.getElementById('filtro-reporte-obra');
        const trabajadorSelect = document.getElementById('filtro-reporte-trabajador');
        
        if (!tipoSelect) return;

        const tipo = tipoSelect.value;
        const mesKey = state.currentMesAsistencia.format('YYYY-MM');
        const asistenciaMes = state.asistencia[mesKey] || {};

        if (tipo === 'obra-historico') {
            document.getElementById('report-period-text').innerText = "Período: Histórico Acumulado";
        } else {
            document.getElementById('report-period-text').innerText = "Período: " + mesTexto.charAt(0).toUpperCase() + mesTexto.slice(1);
        }

        // Actualizar opciones de filtros secundarios
        const filtroMesesContainer = document.getElementById('filtro-reporte-meses');
        
        if (tipo === 'general') {
            obraSelect.style.display = 'none';
            trabajadorSelect.style.display = 'none';
            if(filtroMesesContainer) filtroMesesContainer.style.display = 'none';
        } else if (tipo === 'obra' || tipo === 'obra-historico') {
            obraSelect.style.display = 'inline-block';
            trabajadorSelect.style.display = 'none';
            
            // Llenar obras si está vacío
            if (obraSelect.options.length <= 1) {
                state.obras.forEach(o => {
                    const opt = document.createElement('option');
                    opt.value = o.id;
                    opt.innerText = o.nombre + (o.estado === 'Activa' ? '' : ' (Inactiva)');
                    obraSelect.appendChild(opt);
                });
            }
            
            // Si es histórico, mostrar y poblar checkboxes
            if (tipo === 'obra-historico' && filtroMesesContainer) {
                filtroMesesContainer.style.display = 'flex';
                
                // Recopilar todos los meses registrados
                const mesesSet = new Set(Object.keys(state.asistencia || {}));
                mesesSet.add(mesKey);
                const mesesDisponibles = Array.from(mesesSet).filter(Boolean).sort().reverse();
                
                // Si no hay checkboxes o cambió la cantidad, generarlos
                const existingChecks = filtroMesesContainer.querySelectorAll('.chk-mes-historico');
                if (existingChecks.length === 0) {
                    let chkHtml = '<span style="color: #94a3b8; font-size: 0.9rem; font-weight: 500; margin-right: 8px;">Meses a incluir:</span>';
                    mesesDisponibles.forEach(mk => {
                        const [yy, mm] = mk.split('-');
                        const nom = (meses[parseInt(mm)-1] || mm) + ' ' + yy;
                        chkHtml += `
                            <label style="display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.06); padding: 5px 12px; border-radius: 20px; font-size: 0.85rem; cursor: pointer; user-select: none; border: 1px solid rgba(255,255,255,0.1); color: #fff;">
                                <input type="checkbox" class="chk-mes-historico" value="${mk}" checked onchange="app.renderReporte()" style="cursor: pointer; accent-color: var(--primary);">
                                <span>${nom}</span>
                            </label>
                        `;
                    });
                    filtroMesesContainer.innerHTML = chkHtml;
                }
            } else if (filtroMesesContainer) {
                filtroMesesContainer.style.display = 'none';
            }
        } else if (tipo === 'trabajador') {
            obraSelect.style.display = 'none';
            trabajadorSelect.style.display = 'inline-block';
            if(filtroMesesContainer) filtroMesesContainer.style.display = 'none';
            
            if (trabajadorSelect.options.length <= 1) {
                state.trabajadores.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.innerText = t.nombre;
                    trabajadorSelect.appendChild(opt);
                });
            }
        }

        let html = '';

        if (tipo === 'general') {
            let totalPagar = 0;
            let obrasActivasSet = new Set();
            let trabajadoresActivos = 0;
            let reportHTML = '';
            let costoPorObra = {};

            state.obras.filter(o => o.estado === 'Activa').forEach(o => {
                costoPorObra[o.id] = { nombre: o.nombre, total: 0, dias: 0 };
            });

            state.trabajadores.forEach(trabajador => {
                const diasTrabajados = Object.keys(asistenciaMes[trabajador.id] || {}).length;
                if (diasTrabajados > 0) {
                    trabajadoresActivos++;
                    
                    let adelanto = 0;
                    if(state.adelantos[mesKey] && state.adelantos[mesKey][trabajador.id]) {
                        const diasAdelanto = state.adelantos[mesKey][trabajador.id];
                        for (const f in diasAdelanto) {
                            adelanto += (diasAdelanto[f].monto || 0);
                        }
                    }
                    
                    const montoPagar = (diasTrabajados * trabajador.sueldo) - adelanto;
                    totalPagar += montoPagar;
                    
                    const obrasDelTrabajador = new Set();
                    for (const fecha in asistenciaMes[trabajador.id]) {
                        const obraId = asistenciaMes[trabajador.id][fecha];
                        const obra = state.obras.find(o => o.id === obraId);
                        if (obra) {
                            obrasDelTrabajador.add(obra.nombre);
                            obrasActivasSet.add(obra.id);
                            if (costoPorObra[obraId]) {
                                costoPorObra[obraId].total += trabajador.sueldo;
                                costoPorObra[obraId].dias += 1;
                            }
                        }
                    }

                    reportHTML += `
                        <tr>
                            <td>${trabajador.nombre}</td>
                            <td style="text-align: center;">${diasTrabajados}</td>
                            <td>${Array.from(obrasDelTrabajador).join(', ')}</td>
                            <td style="text-align: right; color: var(--danger);">-$${adelanto.toLocaleString('es-CL')}</td>
                            <td style="text-align: right;">$${montoPagar.toLocaleString('es-CL')}</td>
                        </tr>
                    `;
                }
            });

            if (trabajadoresActivos === 0) {
                reportHTML = `<tr><td colspan="5" class="empty-state-cell" style="text-align: center;">No hay asistencias registradas en este mes.</td></tr>`;
            }

            let obrasHTML = '';
            Object.values(costoPorObra).forEach(obraData => {
                obrasHTML += `
                    <tr>
                        <td>${obraData.nombre}</td>
                        <td style="text-align: center;">${obraData.dias}</td>
                        <td style="text-align: right;">$${obraData.total.toLocaleString('es-CL')}</td>
                    </tr>
                `;
            });

            let notasHTML = '';
            if (state.notas[mesKey]) {
                Object.keys(state.notas[mesKey]).forEach(tId => {
                    const trabajador = state.trabajadores.find(t => t.id === tId);
                    const nombreT = trabajador ? trabajador.nombre : 'Desconocido';
                    
                    const diasNotas = state.notas[mesKey][tId];
                    Object.keys(diasNotas).forEach(fecha => {
                        const nota = diasNotas[fecha];
                        if (nota) {
                            notasHTML += `
                                <tr>
                                    <td>${dayjs(fecha).format('DD/MM/YYYY')}</td>
                                    <td>${nombreT}</td>
                                    <td>${nota}</td>
                                </tr>
                            `;
                        }
                    });
                });
            }

            html = `
                <div class="report-metrics">
                    <div class="report-metric">
                        <span class="metric-label">Trabajadores Activos</span>
                        <span class="metric-val">${trabajadoresActivos}</span>
                    </div>
                    <div class="report-metric">
                        <span class="metric-label">Obras Activas</span>
                        <span class="metric-val">${obrasActivasSet.size}</span>
                    </div>
                    <div class="report-metric highlight">
                        <span class="metric-label">Total a Pagar</span>
                        <span class="metric-val">$${totalPagar.toLocaleString('es-CL')}</span>
                    </div>
                </div>
                
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>Trabajador</th>
                            <th style="text-align: center;">Jornadas Trabajadas</th>
                            <th>Obras Involucradas</th>
                            <th style="text-align: right;">Adelantos</th>
                            <th style="text-align: right;">Total a Pagar</th>
                        </tr>
                    </thead>
                    <tbody>${reportHTML}</tbody>
                </table>
                
                <div style="margin-top: 20px;">
                    <h3 style="color: #1a237e; font-size: 1rem; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px;">Desglose de Mano de Obra por Partida</h3>
                    <table class="report-table" style="width: 100%;">
                        <thead>
                            <tr>
                                <th>Obra</th>
                                <th style="width: 120px; text-align: center;">Jornadas</th>
                                <th style="width: 120px; text-align: right;">Costo</th>
                            </tr>
                        </thead>
                        <tbody>${obrasHTML}</tbody>
                    </table>
                </div>
                
                ${notasHTML ? `
                <div style="margin-top: 20px;">
                    <h3 style="color: #1a237e; font-size: 1rem; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px;">Observaciones del Mes</h3>
                    <table class="report-table" style="width: 100%;">
                        <thead>
                            <tr>
                                <th style="width: 100px;">Fecha</th>
                                <th style="width: 150px;">Trabajador</th>
                                <th>Observación / Nota</th>
                            </tr>
                        </thead>
                        <tbody>${notasHTML}</tbody>
                    </table>
                </div>` : ''}
            `;
            
        } else if (tipo === 'obra') {
            const oId = obraSelect.value;
            if (!oId) {
                html = `<p style="text-align:center; padding: 20px;">Por favor, seleccione una obra.</p>`;
            } else {
                const obra = state.obras.find(o => o.id === oId);
                let rows = '';
                let totalJornadas = 0;
                let costoTotal = 0;
                
                state.trabajadores.forEach(t => {
                    const diasTrab = asistenciaMes[t.id] || {};
                    let jornadasTrabajador = 0;
                    let fechasTrabajador = [];
                    
                    for (const fecha in diasTrab) {
                        if (diasTrab[fecha] === oId) {
                            jornadasTrabajador++;
                            fechasTrabajador.push(dayjs(fecha).format('DD/MM/YYYY'));
                            totalJornadas++;
                            costoTotal += t.sueldo;
                        }
                    }
                    
                    if (jornadasTrabajador > 0) {
                        fechasTrabajador.sort();
                        rows += `
                            <tr>
                                <td>${t.nombre}</td>
                                <td style="text-align:center;">${jornadasTrabajador}</td>
                                <td style="font-size:0.85rem; color: #555;">${fechasTrabajador.join(', ')}</td>
                                <td style="text-align:right;">$${(jornadasTrabajador * t.sueldo).toLocaleString('es-CL')}</td>
                            </tr>
                        `;
                    }
                });
                
                if (!rows) rows = `<tr><td colspan="4" style="text-align:center;">Nadie trabajó en esta obra durante el mes.</td></tr>`;
                
                html = `
                    <div class="report-metrics">
                        <div class="report-metric">
                            <span class="metric-label">Obra</span>
                            <span class="metric-val" style="font-size: 1.1rem;">${obra ? obra.nombre : ''}</span>
                        </div>
                        <div class="report-metric">
                            <span class="metric-label">Total Jornadas</span>
                            <span class="metric-val">${totalJornadas}</span>
                        </div>
                        <div class="report-metric highlight">
                            <span class="metric-label">Costo Mano de Obra</span>
                            <span class="metric-val">$${costoTotal.toLocaleString('es-CL')}</span>
                        </div>
                    </div>
                    
                    <table class="report-table">
                        <thead>
                            <tr>
                                <th>Trabajador</th>
                                <th style="text-align: center; width: 100px;">Jornadas</th>
                                <th>Fechas Trabajadas</th>
                                <th style="text-align: right; width: 120px;">Costo</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                `;
            }
        } else if (tipo === 'trabajador') {
            const tId = trabajadorSelect.value;
            if (!tId) {
                html = `<p style="text-align:center; padding: 20px;">Por favor, seleccione un trabajador.</p>`;
            } else {
                const trabajador = state.trabajadores.find(t => t.id === tId);
                const diasTrab = asistenciaMes[tId] || {};
                let rows = '';
                let totalJornadas = 0;
                
                const fechas = Object.keys(diasTrab).sort();
                fechas.forEach(fecha => {
                    const obraId = diasTrab[fecha];
                    const obra = state.obras.find(o => o.id === obraId);
                    totalJornadas++;
                    rows += `
                        <tr>
                            <td style="width:120px;">${dayjs(fecha).format('DD/MM/YYYY')}</td>
                            <td>${dayjs(fecha).format('dddd').charAt(0).toUpperCase() + dayjs(fecha).format('dddd').slice(1)}</td>
                            <td>${obra ? obra.nombre : 'Desconocida'}</td>
                        </tr>
                    `;
                });
                
                if (!rows) rows = `<tr><td colspan="3" style="text-align:center;">El trabajador no registra asistencia este mes.</td></tr>`;
                
                html = `
                    <div class="report-metrics">
                        <div class="report-metric">
                            <span class="metric-label">Trabajador</span>
                            <span class="metric-val" style="font-size: 1.1rem;">${trabajador ? trabajador.nombre : ''}</span>
                        </div>
                        <div class="report-metric">
                            <span class="metric-label">Jornadas Totales</span>
                            <span class="metric-val">${totalJornadas}</span>
                        </div>
                        <div class="report-metric highlight">
                            <span class="metric-label">Base Mensual</span>
                            <span class="metric-val">$${trabajador ? (totalJornadas * trabajador.sueldo).toLocaleString('es-CL') : 0}</span>
                        </div>
                    </div>
                    
                    <table class="report-table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Día</th>
                                <th>Obra Asignada</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                `;
            }
        } else if (tipo === 'obra-historico') {
            const oId = obraSelect.value;
            if (!oId) {
                html = `<p style="text-align:center; padding: 20px;">Por favor, seleccione una obra.</p>`;
            } else {
                const obra = state.obras.find(o => o.id === oId);
                let rows = '';
                let totalJornadas = 0;
                let costoTotal = 0;
                
                // Extraer los meses seleccionados en los checkboxes
                let chkMeses = Array.from(document.querySelectorAll('.chk-mes-historico:checked')).map(chk => chk.value);
                if (chkMeses.length === 0) {
                    const mesesSet = new Set(Object.keys(state.asistencia || {}));
                    mesesSet.add(mesKey);
                    chkMeses = Array.from(mesesSet).filter(Boolean);
                }
                
                state.trabajadores.forEach(t => {
                    let jornadasTrabajador = 0;
                    let desgloseMeses = {}; // Para mostrar resumen por mes
                    
                    chkMeses.forEach(mk => {
                        const diasTrab = (state.asistencia[mk] || {})[t.id] || {};
                        let subJornadas = 0;
                        let fechasMes = [];
                        for (const fecha in diasTrab) {
                            if (diasTrab[fecha] === oId) {
                                subJornadas++;
                                fechasMes.push(dayjs(fecha).format('DD/MM/YYYY'));
                            }
                        }
                        if (subJornadas > 0) {
                            jornadasTrabajador += subJornadas;
                            fechasMes.sort();
                            const [yy, mm] = mk.split('-');
                            const nom = (meses[parseInt(mm)-1] || mm) + ' ' + yy;
                            desgloseMeses[nom] = {
                                jornadas: subJornadas,
                                fechas: fechasMes
                            };
                        }
                    });

                    if (jornadasTrabajador > 0) {
                        totalJornadas += jornadasTrabajador;
                        costoTotal += (jornadasTrabajador * t.sueldo);
                        
                        let txtMeses = Object.keys(desgloseMeses).map(k => {
                            const item = desgloseMeses[k];
                            return `<div style="margin-bottom: 6px;"><strong>${k} (${item.jornadas} jorn.):</strong> <span style="color: #4b5563;">${item.fechas.join(', ')}</span></div>`;
                        }).join('');
                        
                        rows += `
                            <tr>
                                <td style="vertical-align: top;"><strong>${t.nombre}</strong></td>
                                <td style="text-align:center; font-weight: 600; vertical-align: top;">${jornadasTrabajador}</td>
                                <td style="font-size:0.85rem; vertical-align: top;">${txtMeses}</td>
                                <td style="text-align:right; font-weight: 600; vertical-align: top;">$${(jornadasTrabajador * t.sueldo).toLocaleString('es-CL')}</td>
                            </tr>
                        `;
                    }
                });
                
                if (!rows) rows = `<tr><td colspan="4" style="text-align:center; padding: 20px;">Nadie ha trabajado en esta obra en los meses seleccionados.</td></tr>`;
                
                html = `
                    <div class="report-metrics">
                        <div class="report-metric">
                            <span class="metric-label">Obra (Histórico)</span>
                            <span class="metric-val" style="font-size: 1.1rem;">${obra ? obra.nombre : ''}</span>
                        </div>
                        <div class="report-metric">
                            <span class="metric-label">Jornadas Acumuladas</span>
                            <span class="metric-val">${totalJornadas}</span>
                        </div>
                        <div class="report-metric highlight">
                            <span class="metric-label">Costo Histórico Total</span>
                            <span class="metric-val">$${costoTotal.toLocaleString('es-CL')}</span>
                        </div>
                    </div>
                    
                    <table class="report-table">
                        <thead>
                            <tr>
                                <th>Trabajador</th>
                                <th style="text-align: center; width: 120px;">Jornadas Totales</th>
                                <th>Desglose por Mes</th>
                                <th style="text-align: right; width: 130px;">Costo Acumulado</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                `;
            }
        }

        document.getElementById('report-dynamic-content').innerHTML = html;
    },

    exportarPDF: function() {
        const elemento = document.getElementById('reporte-pdf-container');
        const filename = 'Resumen_Asistencia_' + state.currentMesAsistencia.format('MM_YYYY') + '.pdf';
        
        const opt = {
            margin:       10,
            filename:     filename,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(elemento).save();
    },

    renderObras: function() {
        const tbody = document.getElementById('tabla-obras-body');
        tbody.innerHTML = '';
        
        if (state.obras.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="empty-state-cell" style="text-align:center; color: var(--text-muted);">No hay obras registradas</td></tr>`;
            return;
        }

        state.obras.forEach(o => {
            const estadoBadge = o.estado === 'Activa' 
                ? `<span style="background: rgba(16,185,129,0.2); color: var(--success); padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">Activa</span>` 
                : `<span style="background: rgba(148,163,184,0.2); color: var(--text-muted); padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">Terminada</span>`;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Nombre de la Obra"><strong>${o.nombre}</strong></td>
                <td data-label="Dirección">${o.direccion}</td>
                <td data-label="Estado">${estadoBadge}</td>
                <td data-label="Acciones">
                    <button class="icon-btn" onclick="app.abrirModal('modal-obra', '${o.id}')"><i class="ph ph-pencil-simple"></i></button>
                    <button class="icon-btn" style="color: var(--danger)" onclick="app.eliminarObra('${o.id}')"><i class="ph ph-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    // --- Helpers Globales ---
    guardarDatos: function(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
        
        if (db) {
            db.collection('appData').doc('estado').set({
                trabajadores: state.trabajadores,
                obras: state.obras,
                asistencia: state.asistencia,
                adelantos: state.adelantos,
                notas: state.notas,
                feriados: state.feriados
            }).catch(console.error);
        }

        if(key === 'trabajadores' || key === 'asistencia' || key === 'adelantos') {
            this.updateDashboard();
        }
    },

    updateSelects: function() {
        const selectTrabajador = document.getElementById('select-trabajador-asistencia');
        const valActualT = selectTrabajador.value;
        selectTrabajador.innerHTML = '<option value="">Seleccione un trabajador...</option>';
        state.trabajadores.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.innerText = t.nombre;
            selectTrabajador.appendChild(opt);
        });
        if(valActualT) selectTrabajador.value = valActualT;

        const selectObra = document.getElementById('select-obra-dia');
        selectObra.innerHTML = '<option value="">Seleccione una obra...</option>';
        state.obras.filter(o => o.estado === 'Activa').forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.innerText = o.nombre;
            selectObra.appendChild(opt);
        });
    },

    // --- Dashboard ---
    updateDashboard: function() {
        document.getElementById('current-month-dashboard').innerText = state.currentMesAsistencia.format('MMMM YYYY').replace(/^\w/, c => c.toUpperCase());
        document.getElementById('stat-trabajadores').innerText = state.trabajadores.length;
        document.getElementById('stat-obras').innerText = state.obras.filter(o => o.estado === 'Activa').length;

        // Calcular pago total estimado del mes actual y costos por obra
        const mesActualKey = state.currentMesAsistencia.format('YYYY-MM');
        let totalPagar = 0;
        let costoPorObra = {};
        
        // Inicializar costo de obras activas
        state.obras.filter(o => o.estado === 'Activa').forEach(o => {
            costoPorObra[o.id] = { nombre: o.nombre, total: 0, dias: 0 };
        });

        if (state.asistencia[mesActualKey]) {
            Object.keys(state.asistencia[mesActualKey]).forEach(tId => {
                const diasObj = state.asistencia[mesActualKey][tId];
                const diasTrabajados = Object.keys(diasObj).length;
                const trabajador = state.trabajadores.find(t => t.id === tId);
                
                if (trabajador) {
                    const pagoBruto = diasTrabajados * trabajador.sueldo;
                    let adelanto = 0;
                    if(state.adelantos[mesActualKey] && state.adelantos[mesActualKey][tId]) {
                        const diasAdelanto = state.adelantos[mesActualKey][tId];
                        for (const f in diasAdelanto) {
                            adelanto += (diasAdelanto[f].monto || 0);
                        }
                    }
                    totalPagar += (pagoBruto - adelanto);

                    // Repartir el sueldo entre las obras donde trabajó
                    Object.values(diasObj).forEach(obraId => {
                        if (costoPorObra[obraId]) {
                            costoPorObra[obraId].total += trabajador.sueldo; // suma un día de sueldo a la obra
                            costoPorObra[obraId].dias += 1;
                        }
                    });
                }
            });
        }

        document.getElementById('stat-total-pago').innerText = formatoMoneda.format(Math.max(0, totalPagar));

        // Renderizar lista de costos por obra en el Dashboard
        const ulCostos = document.getElementById('lista-costos-obra');
        ulCostos.innerHTML = '';
        Object.values(costoPorObra).forEach(obraData => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="costo-obra-nombre">${obraData.nombre} <small style="color:var(--text-muted); font-weight:normal;">(${obraData.dias} días)</small></span>
                <span class="costo-obra-monto">${formatoMoneda.format(obraData.total)}</span>
            `;
            ulCostos.appendChild(li);
        });
    },

    // --- Asistencia y Calendario ---
    cambiarMesAsistencia: function(delta) {
        state.currentMesAsistencia = state.currentMesAsistencia.add(delta, 'month');
        this.renderCalendario();
        this.updateDashboard();
        this.renderReporte();
    },

    renderMiniCalendario: function(containerId, mesTarget) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        
        const wrapper = document.createElement('div');
        wrapper.className = 'mini-calendar';
        
        const mesTexto = mesTarget.format('MMMM YYYY').toUpperCase();
        wrapper.innerHTML = `
            <div class="mini-cal-title">${mesTexto}</div>
            <div class="mini-cal-header">
                <div>LUN</div><div>MAR</div><div>MIE</div><div>JUE</div><div>VIE</div><div>SAB</div><div>DOM</div>
            </div>
        `;
        
        const grid = document.createElement('div');
        grid.className = 'mini-cal-grid';
        
        const inicioMes = mesTarget.startOf('month');
        const diasEnMes = mesTarget.endOf('month').date();
        
        let diaSemanaInicio = inicioMes.day();
        diaSemanaInicio = diaSemanaInicio === 0 ? 7 : diaSemanaInicio;
        
        for (let i = 1; i < diaSemanaInicio; i++) {
            grid.innerHTML += '<div></div>';
        }
        
        for (let i = 1; i <= diasEnMes; i++) {
            const esDomingo = mesTarget.date(i).day() === 0;
            const esFeriado = state.feriados[mesTarget.date(i).format('YYYY-MM-DD')];
            let classList = '';
            if (esDomingo || esFeriado) classList = 'class="sunday"';
            
            grid.innerHTML += `<div ${classList}>${i}</div>`;
        }
        
        wrapper.appendChild(grid);
        container.appendChild(wrapper);
    },

    renderCalendario: function() {
        document.getElementById('mes-actual-year').innerText = state.currentMesAsistencia.format('YYYY');
        document.getElementById('mes-actual-month').innerText = state.currentMesAsistencia.format('MMMM');
        
        // Mini calendarios
        const prevMes = state.currentMesAsistencia.subtract(1, 'month');
        const nextMes = state.currentMesAsistencia.add(1, 'month');
        this.renderMiniCalendario('mini-calendar-prev', prevMes);
        this.renderMiniCalendario('mini-calendar-next', nextMes);
        
        const trabajadorId = document.getElementById('select-trabajador-asistencia').value;
        const grid = document.getElementById('calendar-grid');
        const nombreTitulo = document.getElementById('nombre-trabajador-calendario');
        grid.innerHTML = '';
        
        if (trabajadorId) {
            const trabajador = state.trabajadores.find(t => t.id === trabajadorId);
            nombreTitulo.innerText = trabajador ? trabajador.nombre : '';
        } else {
            nombreTitulo.innerText = '';
        }

        const inicioMes = state.currentMesAsistencia.startOf('month');
        const finMes = state.currentMesAsistencia.endOf('month');
        const diasEnMes = finMes.date();
        
        // Calcular espacios vacíos al principio (Lunes = 1, Domingo = 0 -> 7)
        let diaSemanaInicio = inicioMes.day();
        diaSemanaInicio = diaSemanaInicio === 0 ? 7 : diaSemanaInicio;
        
        let weekCounter = 1;
        // Insert first week cell
        let weekCell = document.createElement('div');
        weekCell.className = 'week-num-cell';
        weekCell.innerText = weekCounter;
        grid.appendChild(weekCell);

        for (let i = 1; i < diaSemanaInicio; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'day-cell empty';
            grid.appendChild(emptyCell);
        }

        const mesKey = state.currentMesAsistencia.format('YYYY-MM');
        let diasTrabajados = 0;
        let colCounter = diaSemanaInicio - 1; // Days filled in first week

        for (let i = 1; i <= diasEnMes; i++) {
            if (colCounter === 7) {
                // New row
                weekCounter++;
                let newWeekCell = document.createElement('div');
                newWeekCell.className = 'week-num-cell';
                newWeekCell.innerText = weekCounter;
                grid.appendChild(newWeekCell);
                colCounter = 0;
            }

            const fecha = inicioMes.date(i);
            const fechaStr = fecha.format('YYYY-MM-DD');
            const esDomingo = fecha.day() === 0;
            const esFeriado = state.feriados[fechaStr];
            
            const cell = document.createElement('div');
            cell.className = 'day-cell';
            if (esDomingo) cell.classList.add('sunday');
            if (esFeriado) {
                cell.classList.add('feriado');
                cell.title = esFeriado;
            }

            cell.innerHTML = `<span class="day-number">${i}</span>`;
            if (esFeriado) {
                cell.innerHTML += `<div class="feriado-text">${esFeriado}</div>`;
            }

            // Si hay un trabajador seleccionado, ver si asistió o tuvo adelanto
            if (trabajadorId) {
                // Asistencia
                if (state.asistencia[mesKey] && state.asistencia[mesKey][trabajadorId] && state.asistencia[mesKey][trabajadorId][fechaStr]) {
                    cell.classList.add('asistio');
                    const obraId = state.asistencia[mesKey][trabajadorId][fechaStr];
                    const obra = state.obras.find(o => o.id === obraId);
                    if (obra) {
                        cell.innerHTML += `<div class="day-obra">${obra.nombre}</div>`;
                    } else {
                        cell.innerHTML += `<div class="day-obra">Obra Desconocida</div>`;
                    }
                    diasTrabajados++;
                }
                
                // Adelanto
                if (state.adelantos[mesKey] && state.adelantos[mesKey][trabajadorId] && state.adelantos[mesKey][trabajadorId][fechaStr]) {
                    const adData = state.adelantos[mesKey][trabajadorId][fechaStr];
                    cell.classList.add('adelanto-dia-cell');
                    cell.innerHTML += `<div class="day-adelanto-badge">-$${adData.monto.toLocaleString('es-CL')}</div>`;
                }
                
                // Nota / Observación
                if (state.notas[mesKey] && state.notas[mesKey][trabajadorId] && state.notas[mesKey][trabajadorId][fechaStr]) {
                    cell.innerHTML += `<div style="position: absolute; top: 4px; left: 4px; color: #fbbf24; font-size: 1rem;" title="${state.notas[mesKey][trabajadorId][fechaStr]}"><i class="ph-fill ph-chat-text"></i></div>`;
                }
            }

            // Click event para registrar/modificar asistencia
            cell.onclick = () => {
                if (!trabajadorId) {
                    alert("Primero selecciona un trabajador de la lista.");
                    return;
                }
                this.abrirModalAsistenciaDia(fechaStr, mesKey, trabajadorId);
            };

            grid.appendChild(cell);
            colCounter++;
        }
        
        while (colCounter < 7) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'day-cell empty';
            grid.appendChild(emptyCell);
            colCounter++;
        }

        // Calcular pago acumulado
        let pagoTotal = 0;
        let adelanto = 0;
        if (trabajadorId) {
            const t = state.trabajadores.find(x => x.id === trabajadorId);
            if (t) {
                pagoTotal = diasTrabajados * t.sueldo;
            }
            if(state.adelantos[mesKey] && state.adelantos[mesKey][trabajadorId]) {
                const diasAdelanto = state.adelantos[mesKey][trabajadorId];
                for (const f in diasAdelanto) {
                    adelanto += (diasAdelanto[f].monto || 0);
                }
            }
        }
        document.getElementById('pago-acumulado-mes').innerText = formatoMoneda.format(pagoTotal);
        document.getElementById('adelanto-mes-texto').innerText = `-$${adelanto.toLocaleString('es-CL')}`;
        document.getElementById('pago-final-mes').innerText = formatoMoneda.format(Math.max(0, pagoTotal - adelanto));
    },

    abrirModalAsistenciaDia: function(fechaStr, mesKey, trabajadorId) {
        document.getElementById('fecha-seleccionada').value = fechaStr;
        document.getElementById('texto-fecha-asistencia').innerText = dayjs(fechaStr).format('dddd, D [de] MMMM [de] YYYY').replace(/^\w/, c => c.toUpperCase());
        
        const selectObra = document.getElementById('select-obra-dia');
        const inputAdelanto = document.getElementById('input-adelanto-dia');
        const infoAdelanto = document.getElementById('info-adelanto-dia');
        
        // Ver si ya hay asistencia registrada
        if (state.asistencia[mesKey] && state.asistencia[mesKey][trabajadorId] && state.asistencia[mesKey][trabajadorId][fechaStr]) {
            selectObra.value = state.asistencia[mesKey][trabajadorId][fechaStr];
        } else {
            selectObra.value = "";
        }
        
        // Ver si hay un adelanto registrado
        if (state.adelantos[mesKey] && state.adelantos[mesKey][trabajadorId] && state.adelantos[mesKey][trabajadorId][fechaStr]) {
            const adData = state.adelantos[mesKey][trabajadorId][fechaStr];
            inputAdelanto.value = adData.monto;
            infoAdelanto.innerText = `Ingresado el: ${adData.timestamp}`;
        } else {
            inputAdelanto.value = "";
            infoAdelanto.innerText = "";
        }
        
        // Ver si hay una nota registrada
        const inputNota = document.getElementById('input-nota-dia');
        if (state.notas[mesKey] && state.notas[mesKey][trabajadorId] && state.notas[mesKey][trabajadorId][fechaStr]) {
            inputNota.value = state.notas[mesKey][trabajadorId][fechaStr];
        } else {
            inputNota.value = "";
        }

        this.abrirModal('modal-asistencia-dia');
    },

    guardarAsistenciaDia: function() {
        const fechaStr = document.getElementById('fecha-seleccionada').value;
        const obraId = document.getElementById('select-obra-dia').value;
        const inputAdelanto = document.getElementById('input-adelanto-dia').value;
        const inputNota = document.getElementById('input-nota-dia').value.trim();
        const trabajadorId = document.getElementById('select-trabajador-asistencia').value;
        const mesKey = dayjs(fechaStr).format('YYYY-MM');

        // Guardar Asistencia
        if (obraId) {
            if (!state.asistencia[mesKey]) state.asistencia[mesKey] = {};
            if (!state.asistencia[mesKey][trabajadorId]) state.asistencia[mesKey][trabajadorId] = {};
            state.asistencia[mesKey][trabajadorId][fechaStr] = obraId;
        } else {
            // Si el select está vacío, eliminamos la asistencia de este día
            if (state.asistencia[mesKey] && state.asistencia[mesKey][trabajadorId]) {
                delete state.asistencia[mesKey][trabajadorId][fechaStr];
            }
        }
        
        // Guardar Adelanto
        if (inputAdelanto && parseInt(inputAdelanto) > 0) {
            if (!state.adelantos[mesKey]) state.adelantos[mesKey] = {};
            if (!state.adelantos[mesKey][trabajadorId]) state.adelantos[mesKey][trabajadorId] = {};
            state.adelantos[mesKey][trabajadorId][fechaStr] = {
                monto: parseInt(inputAdelanto),
                timestamp: dayjs().format('DD/MM/YYYY HH:mm:ss')
            };
        } else {
            // Si está vacío, eliminamos el adelanto
            if (state.adelantos[mesKey] && state.adelantos[mesKey][trabajadorId]) {
                delete state.adelantos[mesKey][trabajadorId][fechaStr];
            }
        }
        
        // Guardar Nota
        if (inputNota) {
            if (!state.notas[mesKey]) state.notas[mesKey] = {};
            if (!state.notas[mesKey][trabajadorId]) state.notas[mesKey][trabajadorId] = {};
            state.notas[mesKey][trabajadorId][fechaStr] = inputNota;
        } else {
            if (state.notas[mesKey] && state.notas[mesKey][trabajadorId]) {
                delete state.notas[mesKey][trabajadorId][fechaStr];
            }
        }

        this.guardarDatos('asistencia', state.asistencia);
        this.guardarDatos('adelantos', state.adelantos);
        this.guardarDatos('notas', state.notas);

        this.cerrarModal('modal-asistencia-dia');
        this.renderCalendario();
        this.updateDashboard();
    },

    borrarAsistenciaDia: function() {
        const fechaStr = document.getElementById('fecha-seleccionada').value;
        const trabajadorId = document.getElementById('select-trabajador-asistencia').value;
        const mesKey = dayjs(fechaStr).format('YYYY-MM');

        if (state.asistencia[mesKey] && state.asistencia[mesKey][trabajadorId] && state.asistencia[mesKey][trabajadorId][fechaStr]) {
            delete state.asistencia[mesKey][trabajadorId][fechaStr];
            this.guardarDatos('asistencia', state.asistencia);
        }
        
        if (state.adelantos[mesKey] && state.adelantos[mesKey][trabajadorId] && state.adelantos[mesKey][trabajadorId][fechaStr]) {
            delete state.adelantos[mesKey][trabajadorId][fechaStr];
            this.guardarDatos('adelantos', state.adelantos);
        }
        
        if (state.notas[mesKey] && state.notas[mesKey][trabajadorId] && state.notas[mesKey][trabajadorId][fechaStr]) {
            delete state.notas[mesKey][trabajadorId][fechaStr];
            this.guardarDatos('notas', state.notas);
        }

        this.cerrarModal('modal-asistencia-dia');
        this.renderCalendario();
    },

    // --- Asistencia Masiva ---
    abrirModalAsistenciaMasiva: function() {
        const selectObra = document.getElementById('select-obra-masiva');
        selectObra.innerHTML = '<option value="">Seleccione una obra...</option>';
        state.obras.filter(o => o.estado === 'Activa').forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.innerText = o.nombre;
            selectObra.appendChild(opt);
        });

        // Configurar fecha por defecto a hoy
        const hoyStr = dayjs().format('YYYY-MM-DD');
        document.getElementById('fecha-masiva-desde').value = hoyStr;
        document.getElementById('fecha-masiva-hasta').value = hoyStr;

        // Llenar lista de trabajadores
        const listaCont = document.getElementById('lista-trabajadores-masiva');
        listaCont.innerHTML = '';
        
        if (state.trabajadores.length === 0) {
            listaCont.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No hay trabajadores registrados.</p>';
        } else {
            state.trabajadores.forEach(t => {
                const label = document.createElement('label');
                label.className = 'checkbox-item';
                label.innerHTML = `
                    <input type="checkbox" class="chk-trabajador-masiva" value="${t.id}">
                    <span>${t.nombre} - ${t.especialidad}</span>
                `;
                listaCont.appendChild(label);
            });
        }

        this.abrirModal('modal-asistencia-masiva');
    },

    guardarAsistenciaMasiva: function() {
        const fechaDesdeStr = document.getElementById('fecha-masiva-desde').value;
        const fechaHastaStr = document.getElementById('fecha-masiva-hasta').value;
        const obraId = document.getElementById('select-obra-masiva').value;

        if (!fechaDesdeStr || !fechaHastaStr) {
            alert('Por favor selecciona el rango de fechas (Desde y Hasta).');
            return;
        }

        if (!obraId) {
            alert('Por favor selecciona una obra.');
            return;
        }

        const checkboxes = document.querySelectorAll('.chk-trabajador-masiva:checked');
        if (checkboxes.length === 0) {
            alert('Por favor selecciona al menos un trabajador.');
            return;
        }

        const fechaInicio = dayjs(fechaDesdeStr);
        const fechaFin = dayjs(fechaHastaStr);

        if (fechaFin.isBefore(fechaInicio)) {
            alert('La fecha "Hasta" no puede ser anterior a la fecha "Desde".');
            return;
        }

        let currentDate = fechaInicio;
        while (currentDate.isBefore(fechaFin) || currentDate.isSame(fechaFin, 'day')) {
            const fechaStr = currentDate.format('YYYY-MM-DD');
            const mesKey = currentDate.format('YYYY-MM');

            if (!state.asistencia[mesKey]) state.asistencia[mesKey] = {};

            checkboxes.forEach(chk => {
                const tId = chk.value;
                if (!state.asistencia[mesKey][tId]) state.asistencia[mesKey][tId] = {};
                state.asistencia[mesKey][tId][fechaStr] = obraId;
            });
            
            currentDate = currentDate.add(1, 'day');
        }

        this.guardarDatos('asistencia', state.asistencia);
        this.cerrarModal('modal-asistencia-masiva');
        this.updateDashboard();
        if (state.currentTrabajadorAsistencia) this.renderCalendario();
        
        alert(`Se guardó la asistencia de ${checkboxes.length} trabajador(es) correctamente.`);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

window.onerror = function(msg, url, lineNo, columnNo, error) {
    alert("Error JS: " + msg + "\nLinea: " + lineNo);
    return false;
};
