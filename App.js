import React, { useState, useEffect, useMemo } from 'react';
import { 
    View, Text, StyleSheet, Alert, ActivityIndicator, 
    SafeAreaView, Platform, TouchableOpacity, ScrollView 
} from 'react-native';
import { supabase } from './lib/supabase';

// Telas do sistema
import HomeScreen from './screen/Home';
import AgendamentoFeriasScreen from './screen/AgendamentoFeriasScreen';
import EdicaoFeriasScreen from './screen/EdicaoFeriasScreen';
import Funcionarios from './screen/Funcionarios';
import VisaoMensalScreen from './screen/VisaoMensalScreen';

// --- 1. CONFIGURAÇÕES TÉCNICAS E CORES ---

const COLORS = {
    BG: '#f4f7f6',
    HEADER: '#f8f8f8',
    LINE: '#d6dcd9',
    TEXT: '#222',
    MUTED: '#666',
    WORK_DAY: '#3B7D23',    // 06h às 18h (Verde)
    WORK_NIGHT: '#10202E',  // 18h às 06h (Azul Noturno)
    ADM_WORK: '#7B1FA2',    // ADM Seg-Sex (Roxo)
    OFF: '#f5f5f5',
    PRIMARY: '#4a61dd',
    HIGHLIGHT: '#F59E0B',
    HIGHLIGHT_BORDER: '#D97706',
    HIGHLIGHT_BG: '#FFFBEB',
    CARD_BG: '#ffffff'
};

const ANCHORS = {
    'A': new Date(2025, 11, 27),
    'B': new Date(2025, 11, 29),
    'C': new Date(2025, 11, 31),
    'D': new Date(2026, 0, 2)
};

// --- 2. UTILITÁRIOS DE DATA E FEEDBACK ---

const toIsoDate = (val) => {
    if (!val) return null;
    const s = String(val).trim();
    if (s.includes('/')) {
        const [d, m, y] = s.split('/');
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return s.substring(0, 10);
};

const showFeedback = (title, message) => {
    console.log(`[${title}]`, message);
    if (Platform.OS === 'web') {
        window.alert(`${title}: ${message}`);
    } else {
        Alert.alert(title, message);
    }
};

const parseDateSafe = (dateStr) => {
    if (!dateStr) return null;
    try {
        const cleanStr = typeof dateStr === 'string' ? dateStr.split('T')[0] : dateStr;
        if (cleanStr.includes('-')) {
            const [year, month, day] = cleanStr.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            date.setHours(0, 0, 0, 0);
            return isNaN(date.getTime()) ? null : date;
        } else if (cleanStr.includes('/')) {
            const [day, month, year] = cleanStr.split('/').map(Number);
            const date = new Date(year, month - 1, day);
            date.setHours(0, 0, 0, 0);
            return isNaN(date.getTime()) ? null : date;
        }
        const d = new Date(dateStr);
        d.setHours(0, 0, 0, 0);
        return isNaN(d.getTime()) ? null : d;
    } catch (e) { return null; }
};

const formatDateKey = (date) => {
    try { return date.toISOString().split('T')[0]; } catch (e) { return ''; }
};

const extrairLetraFuncionario = (funcionario) => {
    if (!funcionario) return 'A';
    const letraDireta = funcionario.letra?.toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(letraDireta)) return letraDireta;
    if (funcionario.letra === 'Ferista') return 'Ferista';
    const match = funcionario.nome?.match(/Letra\s([A-D])/i);
    return match ? match[1].toUpperCase() : 'A';
};

const getShiftTypeForDate = (date, letra) => {
    const anchor = ANCHORS[letra] || ANCHORS['A'];
    const diffTime = date.getTime() - anchor.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const cycleDay = ((diffDays % 8) + 8) % 8;
    if (cycleDay === 0 || cycleDay === 1) return 'DAY';
    if (cycleDay === 2 || cycleDay === 3) return 'NIGHT';
    return 'OFF';
};

// --- 3. LÓGICA DINÂMICA DO FERISTA ---

const gerarEscalaFerista = (agendamentos, listaFuncionarios) => {
    if (!listaFuncionarios || listaFuncionarios.length === 0) return {};

    const mapaFerista = {};
    const ordenados = [...(agendamentos || [])].sort((a, b) => {
        const da = parseDateSafe(a.data_inicio || a.startDate);
        const db = parseDateSafe(b.data_inicio || b.startDate);
        return (da?.getTime() || 0) - (db?.getTime() || 0);
    });

    let simStart = new Date(2025, 0, 1);
    let simEnd = new Date(2028, 11, 31);

    const dayVacationMap = {};
    ordenados.forEach(sch => {
        const start = parseDateSafe(sch.data_inicio || sch.startDate);
        const end = parseDateSafe(sch.data_fim || sch.endDate);
        const emp = listaFuncionarios.find(f => f.id === (sch.employee_id || sch.employeeId));
        if (start && end && emp && emp.letra !== 'Ferista') {
            let curr = new Date(start);
            while (curr <= end) {
                const k = formatDateKey(curr);
                if (!dayVacationMap[k]) dayVacationMap[k] = [];
                const letra = extrairLetraFuncionario(emp);
                if (!dayVacationMap[k].includes(letra)) {
                    dayVacationMap[k].push(letra);
                }
                curr.setDate(curr.getDate() + 1);
            }
        }
    });

    const getDaysUntilCoverageStarts = (fromDate) => {
        let check = new Date(fromDate);
        for (let offset = 1; offset <= 7; offset++) {
            check.setDate(check.getDate() + 1);
            const k = formatDateKey(check);
            if ((dayVacationMap[k] || []).length > 0) {
                const dayOfWeek = check.getDay();
                return { offset, dayOfWeek };
            }
        }
        return { offset: 999, dayOfWeek: -1 };
    };

    const getDaysUntilNextDayShift = (fromDate) => {
        let check = new Date(fromDate);
        for (let offset = 1; offset <= 8; offset++) {
            check.setDate(check.getDate() + 1);
            const k = formatDateKey(check);
            const letras = dayVacationMap[k] || [];
            for (let l of letras) {
                if (getShiftTypeForDate(check, l) === 'DAY') return offset;
            }
        }
        return 999;
    };

    let currentWorkedBlock = 0;
    let consecutiveOffDays = 0;
    let mandatoryOffRemaining = 0;

    let iter = new Date(simStart);
    while (iter <= simEnd) {
        const key = formatDateKey(iter);
        const dayOfWeek = iter.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const letrasEmFerias = dayVacationMap[key] || [];

        let hasDay = false;
        let hasNight = false;

        for (let letra of letrasEmFerias) {
            const s = getShiftTypeForDate(iter, letra);
            if (s === 'DAY') hasDay = true;
            if (s === 'NIGHT') hasNight = true;
        }

        if (mandatoryOffRemaining > 0) {
            mapaFerista[key] = { tipo: 'FOLGA', descricao: 'Descanso Proporcional' };
            mandatoryOffRemaining--;
            currentWorkedBlock = 0;
            consecutiveOffDays++;
        }
        else if (letrasEmFerias.length > 0) {
            if (currentWorkedBlock >= 4) {
                mandatoryOffRemaining = 3;
                currentWorkedBlock = 0;
                consecutiveOffDays = 1;
                mapaFerista[key] = { tipo: 'FOLGA', descricao: 'Descanso Limite 4 Dias' };
            } else if (hasDay) {
                mapaFerista[key] = { tipo: 'TRABALHO_DIA', descricao: 'Cobertura Diurna' };
                currentWorkedBlock++;
                consecutiveOffDays = 0;
            } else if (hasNight) {
                const daysUntilNextDay = getDaysUntilNextDayShift(iter);
                const neededOffIfWorkToday = currentWorkedBlock + 1;

                if (daysUntilNextDay <= neededOffIfWorkToday) {
                    if (currentWorkedBlock > 0) {
                        mandatoryOffRemaining = Math.min(3, currentWorkedBlock - 1);
                        currentWorkedBlock = 0;
                    }
                    mapaFerista[key] = { tipo: 'FOLGA', descricao: 'Folga Preparatória Dia' };
                    consecutiveOffDays++;
                } else {
                    mapaFerista[key] = { tipo: 'TRABALHO_NOITE', descricao: 'Cobertura Noturna' };
                    currentWorkedBlock++;
                    consecutiveOffDays = 0;
                }
            } else {
                if (currentWorkedBlock > 0) {
                    mandatoryOffRemaining = Math.min(3, currentWorkedBlock - 1);
                    currentWorkedBlock = 0;
                }
                mapaFerista[key] = { tipo: 'FOLGA', descricao: 'Folga Escala Coberta' };
                consecutiveOffDays++;
            }
        }
        else {
            if (currentWorkedBlock > 0) {
                mandatoryOffRemaining = Math.min(3, currentWorkedBlock - 1);
                currentWorkedBlock = 0;
                consecutiveOffDays = 1;
                mapaFerista[key] = { tipo: 'FOLGA', descricao: 'Descanso Pós-Cobertura' };
            } else if (isWeekend) {
                mapaFerista[key] = { tipo: 'FOLGA', descricao: 'Folga Fim de Semana ADM' };
                consecutiveOffDays++;
            } else {
                const { offset, dayOfWeek: targetDayOfWeek } = getDaysUntilCoverageStarts(iter);
                let deveFolgarHoje = false;

                if (targetDayOfWeek === 2 && offset === 1) {
                    deveFolgarHoje = true;
                } else if (targetDayOfWeek === 3 && offset === 1) {
                    deveFolgarHoje = true;
                } else if (targetDayOfWeek === 4 && offset === 1) {
                    deveFolgarHoje = true;
                } else if (targetDayOfWeek === 5 && offset === 1) {
                    deveFolgarHoje = true;
                } else if ((targetDayOfWeek === 6 || targetDayOfWeek === 0) && (dayOfWeek === 4 || dayOfWeek === 5)) {
                    deveFolgarHoje = true;
                }

                if (deveFolgarHoje) {
                    mapaFerista[key] = { tipo: 'FOLGA', descricao: 'Folga Pré-Cobertura ADM' };
                    consecutiveOffDays++;
                } else {
                    mapaFerista[key] = { tipo: 'TRABALHO_ADM', descricao: 'Horário ADM' };
                    consecutiveOffDays = 0;
                }
            }
        }

        iter.setDate(iter.getDate() + 1);
    }

    return mapaFerista;
};

// --- 4. COMPONENTE PRINCIPAL (APP) ---

export default function App() {
    const [currentScreen, setCurrentScreen] = useState('HOME');
    const [employees, setEmployees] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [scheduleToEdit, setScheduleToEdit] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: emp, error: errEmp } = await supabase
                .from('seguranca_employees')
                .select('*')
                .order('nome');

            const { data: sch, error: errSch } = await supabase
                .from('seguranca_schedules')
                .select('*');

            if (errEmp || errSch) {
                console.error("Erro Supabase:", errEmp || errSch);
            }

            const mappedSchedules = (sch || []).map(s => ({
                ...s,
                id: s.id,
                employeeId: s.employee_id || s.employeeId,
                employee_id: s.employee_id || s.employeeId,
                employeeName: s.employee_name || s.employeeName,
                employee_name: s.employee_name || s.employeeName,
                startDate: s.data_inicio || s.startDate,
                data_inicio: s.data_inicio || s.startDate,
                endDate: s.data_fim || s.endDate,
                data_fim: s.data_fim || s.endDate,
                durationDays: s.duration_days || s.durationDays || 30,
                duration_days: s.duration_days || s.durationDays || 30
            }));

            setEmployees(emp || []);
            setSchedules(mappedSchedules);
        } catch (e) {
            showFeedback("Erro", "Erro ao carregar dados da segurança.");
        } finally { 
            setLoading(false); 
        }
    };

    useEffect(() => { 
        fetchData(); 
    }, []);

    // Handlers de Funcionários
    const handleSaveEmployee = async (payload) => {
        const { error } = await supabase
            .from('seguranca_employees')
            .insert([payload]);

        if (error) {
            showFeedback("Erro", "Falha ao cadastrar colaborador: " + error.message);
        } else {
            await fetchData();
        }
    };

    const handleUpdateEmployee = async (data) => {
        const { id, ...payload } = data;
        const { error } = await supabase
            .from('seguranca_employees')
            .update(payload)
            .eq('id', id);

        if (error) {
            showFeedback("Erro", "Falha ao atualizar colaborador: " + error.message);
        } else {
            await fetchData();
        }
    };

    const feristaData = useMemo(() => {
        return gerarEscalaFerista(schedules, employees);
    }, [schedules, employees]);

    // Salvar Agendamento
    const handleSaveSchedule = async (record) => {
        try {
            const empId = record.employee_id || record.employeeId;
            const stRaw = record.data_inicio || record.startDate;
            const enRaw = record.data_fim || record.endDate;
            const dur = record.duration_days || record.durationDays || record.dias || 30;
            const empName = record.employee_name || record.employeeName || '';

            const stFormatted = toIsoDate(stRaw);
            const enFormatted = toIsoDate(enRaw);

            if (!empId || !stFormatted) {
                showFeedback("Atenção", "Selecione o colaborador e a data inicial.");
                return;
            }

            let { error } = await supabase
                .from('seguranca_schedules')
                .insert([{
                    employee_id: empId,
                    employee_name: empName,
                    data_inicio: stFormatted,
                    data_fim: enFormatted,
                    duration_days: parseInt(dur, 10)
                }]);

            if (error && error.message.includes('column')) {
                const fallback = await supabase
                    .from('seguranca_schedules')
                    .insert([{
                        employeeId: empId,
                        employeeName: empName,
                        startDate: stFormatted,
                        endDate: enFormatted,
                        durationDays: parseInt(dur, 10)
                    }]);
                error = fallback.error;
            }

            if (error) {
                showFeedback("Erro no Banco", error.message);
                return;
            }

            await fetchData(); 
            setCurrentScreen('HOME'); 
        } catch (err) {
            showFeedback("Falha Inesperada", err.message);
        }
    };

    // Atualizar Agendamento
    const handleUpdateSchedule = async (data) => {
        try {
            const { id, ...record } = data;
            const stFormatted = toIsoDate(record.data_inicio || record.startDate);
            const enFormatted = toIsoDate(record.data_fim || record.endDate);
            const dur = record.duration_days || record.durationDays || record.dias || 30;
            const empId = record.employee_id || record.employeeId;
            const empName = record.employee_name || record.employeeName || '';

            let { error } = await supabase
                .from('seguranca_schedules')
                .update({
                    employee_id: empId,
                    employee_name: empName,
                    data_inicio: stFormatted,
                    data_fim: enFormatted,
                    duration_days: parseInt(dur, 10)
                })
                .eq('id', id);

            if (error && error.message.includes('column')) {
                const fallback = await supabase
                    .from('seguranca_schedules')
                    .update({
                        employeeId: empId,
                        employeeName: empName,
                        startDate: stFormatted,
                        endDate: enFormatted,
                        durationDays: parseInt(dur, 10)
                    })
                    .eq('id', id);
                error = fallback.error;
            }

            if (error) {
                showFeedback("Erro ao Atualizar", error.message);
                return;
            }

            await fetchData(); 
            setCurrentScreen('HOME'); 
        } catch (err) {
            showFeedback("Falha Inesperada", err.message);
        }
    };

    // Excluir Agendamento
    const handleDeleteSchedules = async (ids) => {
        const { error } = await supabase
            .from('seguranca_schedules')
            .delete()
            .in('id', ids);

        if (!error) {
            await fetchData();
        } else {
            showFeedback("Erro ao Excluir", error.message);
        }
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={COLORS.PRIMARY} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {currentScreen === 'HOME' && (
                <HomeScreen 
                    employees={employees} 
                    schedules={schedules} 
                    feristaData={feristaData}
                    onOpenRegister={() => setCurrentScreen('FUNCIONARIOS')}
                    onOpenMonthly={() => setCurrentScreen('MENSAL')}
                    onOpenSchedule={(d) => { 
                        if (d) {
                            const normalized = {
                                ...d,
                                id: d.id,
                                employeeId: d.employee_id || d.employeeId,
                                employee_id: d.employee_id || d.employeeId,
                                employeeName: d.employee_name || d.employeeName,
                                employee_name: d.employee_name || d.employeeName,
                                startDate: d.data_inicio || d.startDate,
                                data_inicio: d.data_inicio || d.startDate,
                                endDate: d.data_fim || d.endDate,
                                data_fim: d.data_fim || d.endDate,
                                durationDays: d.duration_days || d.durationDays || d.dias || 30
                            };
                            setScheduleToEdit(normalized);
                            setCurrentScreen('EDITAR');
                        } else {
                            setScheduleToEdit(null);
                            setCurrentScreen('AGENDAR');
                        }
                    }}
                    onDeleteSchedules={handleDeleteSchedules}
                />
            )}
            
            {currentScreen === 'MENSAL' && (
                <VisaoMensalScreen 
                    employees={employees} 
                    schedules={schedules} 
                    onBack={() => setCurrentScreen('HOME')} 
                />
            )}

            {currentScreen === 'AGENDAR' && (
                <AgendamentoFeriasScreen 
                    employees={employees} 
                    onSchedule={handleSaveSchedule} 
                    onCancel={() => setCurrentScreen('HOME')} 
                />
            )}

            {currentScreen === 'EDITAR' && (
                <EdicaoFeriasScreen 
                    scheduleToEdit={scheduleToEdit} 
                    employees={employees} 
                    schedules={schedules}
                    onUpdate={handleUpdateSchedule} 
                    onCancel={() => setCurrentScreen('HOME')} 
                />
            )}

            {currentScreen === 'FUNCIONARIOS' && (
                <Funcionarios 
                    employees={employees} 
                    schedules={schedules}
                    onBack={() => setCurrentScreen('HOME')} 
                    onSave={handleSaveEmployee} 
                    onUpdate={handleUpdateEmployee} 
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});