import React, { useState, useRef, useMemo } from 'react';
import {
    SafeAreaView, View, Text, TouchableOpacity,
    ScrollView, StyleSheet, Modal, Switch, TextInput
} from 'react-native';

const COLORS = {
    BG: '#f4f7f6', 
    HEADER: '#f8f8f8', 
    LINE: '#d6dcd9',
    TEXT: '#222', 
    MUTED: '#666', 
    HOJE: '#dcebff',
    VACATION: '#C00000', 
    WORK_DAY: '#3B7D23',    // 06h às 18h (Verde)
    WORK_NIGHT: '#10202E',  // 18h às 06h (Azul Noturno)
    ADM_WORK: '#7B1FA2',    // Horário ADM Seg-Sex (Roxo)
    OFF: '#f5f5f5',  
    PRIMARY: '#4a61dd', 
    SAVE: '#4CAF50', 
    VIEW: '#00c7b7', 
    DELETE: '#E53935',
    CARD_BG: '#ffffff',
    HIGHLIGHT: '#F59E0B',
    HIGHLIGHT_BORDER: '#D97706',
    HIGHLIGHT_BG: '#FFFBEB'
};

const DAY_WIDTH = 50; 
const ROW_HEIGHT = 60; 

const ANCHORS = {
    'A': new Date(2025, 11, 27),
    'B': new Date(2025, 11, 29),
    'C': new Date(2025, 11, 31),
    'D': new Date(2026, 0, 2)
};

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, index) => (CURRENT_YEAR - 2) + index);
const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const getLetraWeight = (letra) => {
    const l = (letra || '').trim().toUpperCase();
    if (l === 'A') return 1;
    if (l === 'B') return 2;
    if (l === 'C') return 3;
    if (l === 'D') return 4;
    return 5;
};

function parseSafeDate(dateVal) {
    if (!dateVal) return null;
    let d;
    if (typeof dateVal === 'string') {
        const cleanDate = dateVal.substring(0, 10);
        if (cleanDate.includes('-')) {
            const [y, m, d_] = cleanDate.split('-').map(Number);
            d = new Date(y, m - 1, d_);
        } else if (cleanDate.includes('/')) {
            const [d_, m, y] = cleanDate.split('/').map(Number);
            d = new Date(y, m - 1, d_);
        }
    } else { d = new Date(dateVal); }
    if (!d || isNaN(d.getTime())) return null;
    d.setHours(0,0,0,0);
    return d;
}

const formatDateKey = (date) => {
    try { return date.toISOString().split('T')[0]; } catch (e) { return ''; }
};

function getShiftTypeForDate(targetDate, letra) {
    const anchor = ANCHORS[letra] || ANCHORS['A'];
    const diffTime = targetDate.getTime() - anchor.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const cycleDay = ((diffDays % 8) + 8) % 8;

    if (cycleDay === 0 || cycleDay === 1) return 'DAY';
    if (cycleDay === 2 || cycleDay === 3) return 'NIGHT';
    return 'OFF';
}

function getActiveLetrasForDate(targetDate) {
    const letras = ['A', 'B', 'C', 'D'];
    let dayLetra = null;
    let nightLetra = null;

    for (let l of letras) {
        const shift = getShiftTypeForDate(targetDate, l);
        if (shift === 'DAY') dayLetra = l;
        if (shift === 'NIGHT') nightLetra = l;
    }
    return { dayLetra, nightLetra };
}

export default function HomeScreen({ 
    employees, schedules, feristaData = {}, 
    onOpenRegister, onOpenMonthly, onOpenSchedule, onDeleteSchedules 
}) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [showYearPicker, setShowYearPicker] = useState(false);
    
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [filterSearchText, setFilterSearchText] = useState('');
    
    const [editingSchedule, setEditingSchedule] = useState(null); 
    const [showConfirmDelete, setShowConfirmDelete] = useState(false); 
    
    const [isCalendarTurnosView, setIsCalendarTurnosView] = useState(false); 
    const [selectedEmployees, setSelectedEmployees] = useState([]);

    const headerScrollRef = useRef(null);
    const gridScrollRef = useRef(null);

    const activeEmployees = useMemo(() => {
        const list = (employees || []).filter(e => e.status !== false);
        return list.sort((a, b) => {
            const weightA = getLetraWeight(a.letra);
            const weightB = getLetraWeight(b.letra);
            if (weightA !== weightB) return weightA - weightB;
            return (a.nome || '').localeCompare(b.nome || '');
        });
    }, [employees]);

    const getEmployeeData = (empId) => {
        return (employees || []).find(e => e.id === empId) || { letra: 'A', status: true, nome: 'Colaborador' };
    };

    const calculateStandardScaleColor = (targetDate, letra) => {
        const shift = getShiftTypeForDate(targetDate, letra);
        if (shift === 'DAY') return { backgroundColor: COLORS.WORK_DAY };
        if (shift === 'NIGHT') return { backgroundColor: COLORS.WORK_NIGHT };
        return { backgroundColor: COLORS.OFF };
    };

    const getScaleStyle = (targetDate, emp) => {
        if (emp.letra === 'Ferista' || (emp.nome && emp.nome.toUpperCase().includes('FERISTA'))) {
            const dateKey = formatDateKey(targetDate);
            const calculated = feristaData ? feristaData[dateKey] : null;
            if (calculated) {
                if (calculated.tipo === 'TRABALHO_DIA') return { backgroundColor: COLORS.WORK_DAY };
                if (calculated.tipo === 'TRABALHO_NOITE') return { backgroundColor: COLORS.WORK_NIGHT };
                if (calculated.tipo === 'TRABALHO_ADM') return { backgroundColor: COLORS.ADM_WORK };
            }
            return { backgroundColor: COLORS.OFF };
        }
        return calculateStandardScaleColor(targetDate, emp.letra || 'A');
    };

    const getStatusEDatas = (schedule) => {
        if (!schedule) return { saida: '--', retorno: '--', fim: '--', inicio: '--' };
        const stStr = schedule.startDate || schedule.data_inicio;
        const dur = schedule.durationDays || schedule.dias || 30;
        const empId = schedule.employeeId || schedule.employee_id;

        const start = parseSafeDate(stStr);
        if (!start) return { saida: '--', retorno: '--', fim: '--', inicio: '--' };
        const emp = getEmployeeData(empId);
        
        const getDayType = (date) => {
            const style = calculateStandardScaleColor(date, emp.letra || 'A');
            return style.backgroundColor !== COLORS.OFF ? 'TRABALHO' : 'FOLGA';
        };

        // 1. Encontra o último dia de trabalho antes das férias
        let saida = new Date(start);
        saida.setDate(saida.getDate() - 1);
        while (getDayType(saida) === 'FOLGA') {
            saida.setDate(saida.getDate() - 1);
        }
        
        // 2. A saída antecipada (folga) é o PRIMEIRO dia da folga após esse último dia de trabalho
        let saidaFolga = new Date(saida);
        saidaFolga.setDate(saidaFolga.getDate() + 1);
        while (getDayType(saidaFolga) === 'TRABALHO') {
            saidaFolga.setDate(saidaFolga.getDate() + 1);
        }

        const fim = new Date(start);
        fim.setDate(fim.getDate() + (parseInt(dur) - 1));
        
        let retorno = new Date(fim);
        retorno.setDate(retorno.getDate() + 1);
        while (getDayType(retorno) === 'FOLGA') {
            retorno.setDate(retorno.getDate() + 1);
        }

        const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        return { saida: fmt(saidaFolga), retorno: fmt(retorno), fim: fmt(fim), inicio: fmt(start) };
    };

    const changeMonth = (delta) => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1));
    };

    const toggleEmployeeSelection = (name) => {
        setSelectedEmployees(prev => {
            if (prev.includes(name)) {
                return prev.filter(n => n !== name);
            } else {
                return [...prev, name];
            }
        });
    };

    const timelineDays = useMemo(() => {
        return Array.from({ length: 42 }, (_, i) => {
            const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            d.setDate(d.getDate() + i);
            return d;
        });
    }, [currentDate]);

    const calendarGridDays = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const startDayOffset = firstDay.getDay(); 

        return Array.from({ length: 35 }, (_, i) => {
            return new Date(year, month, 1 - startDayOffset + i);
        });
    }, [currentDate]);

    const dailyRosterMap = useMemo(() => {
        const roster = {};
        const activeSchedules = schedules || [];

        const getVacationForEmp = (empId, date) => {
            return activeSchedules.find(s => {
                if ((s.employeeId || s.employee_id) !== empId) return false;
                const st = parseSafeDate(s.startDate || s.data_inicio);
                let en = parseSafeDate(s.endDate || s.data_fim);
                if (!en && st) {
                    const days = parseInt(s.durationDays || s.dias || 30, 10);
                    en = new Date(st);
                    en.setDate(en.getDate() + (days - 1));
                }
                if (!st || !en) return false;
                return date >= st && date <= en;
            });
        };

        calendarGridDays.forEach(targetDate => {
            const k = formatDateKey(targetDate);
            const { dayLetra, nightLetra } = getActiveLetrasForDate(targetDate);

            roster[k] = { 
                day: [], 
                night: [], 
                adm: [],
                vacations: [],
                dayLetra: dayLetra || 'A',
                nightLetra: nightLetra || 'B'
            };

            activeEmployees.forEach(emp => {
                const vacObj = getVacationForEmp(emp.id, targetDate);

                if (vacObj) {
                    roster[k].vacations.push({
                        name: emp.nome,
                        letra: emp.letra,
                        schedule: vacObj
                    });
                    return;
                }

                if (emp.letra === 'Ferista' || (emp.nome && emp.nome.toUpperCase().includes('FERISTA'))) {
                    const feristaShift = feristaData ? feristaData[k] : null;
                    if (feristaShift) {
                        if (feristaShift.tipo === 'TRABALHO_DIA') roster[k].day.push(emp.nome);
                        else if (feristaShift.tipo === 'TRABALHO_NOITE') roster[k].night.push(emp.nome);
                        else if (feristaShift.tipo === 'TRABALHO_ADM') roster[k].adm.push(emp.nome);
                    }
                } else {
                    const shift = getShiftTypeForDate(targetDate, emp.letra);
                    if (shift === 'DAY') roster[k].day.push(emp.nome);
                    if (shift === 'NIGHT') roster[k].night.push(emp.nome);
                }
            });
        });

        return roster;
    }, [activeEmployees, schedules, calendarGridDays, feristaData]);

    const employeesInTimeline = useMemo(() => {
        if (selectedEmployees.length === 0) return activeEmployees;
        return activeEmployees.filter(e => selectedEmployees.includes(e.nome));
    }, [activeEmployees, selectedEmployees]);

    const modalFilteredEmployees = useMemo(() => {
        if (!filterSearchText) return activeEmployees;
        return activeEmployees.filter(e => 
            (e.nome || '').toLowerCase().includes(filterSearchText.toLowerCase()) ||
            (e.letra || '').toLowerCase().includes(filterSearchText.toLowerCase())
        );
    }, [activeEmployees, filterSearchText]);

    const handleGridScroll = (event) => {
        const x = event.nativeEvent.contentOffset.x;
        if (headerScrollRef.current) {
            headerScrollRef.current.scrollTo({ x, animated: false });
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Modal de Mês/Ano */}
            <Modal visible={showMonthPicker || showYearPicker} transparent animationType="fade">
                <TouchableOpacity style={styles.modalOverlay} onPress={() => {setShowMonthPicker(false); setShowYearPicker(false);}}>
                    <View style={styles.modalContent}>
                        {(showMonthPicker ? MONTHS : YEARS).map((item, i) => (
                            <TouchableOpacity key={item} style={styles.modalItem} onPress={() => {
                                if (showMonthPicker) setCurrentDate(new Date(currentDate.getFullYear(), i, 1));
                                else setCurrentDate(new Date(item, currentDate.getMonth(), 1));
                                setShowMonthPicker(false); setShowYearPicker(false);
                            }}>
                                <Text style={styles.modalText}>{item}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* MODAL DE FILTRO */}
            <Modal visible={showFilterModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.filterPopupCard}>
                        <View style={styles.filterPopupHeader}>
                            <Text style={styles.filterPopupTitle}>Filtrar Colaboradores</Text>
                            <TouchableOpacity onPress={() => setShowFilterModal(false)} style={{ padding: 4 }}>
                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.MUTED }}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <TextInput 
                            style={styles.filterSearchInput}
                            placeholder="Buscar por nome ou letra..."
                            value={filterSearchText}
                            onChangeText={setFilterSearchText}
                        />

                        <View style={styles.filterQuickActions}>
                            <TouchableOpacity 
                                style={[styles.filterQuickBtn, selectedEmployees.length === 0 && styles.filterQuickBtnActive]}
                                onPress={() => setSelectedEmployees([])}
                            >
                                <Text style={[styles.filterQuickBtnText, selectedEmployees.length === 0 && styles.filterQuickBtnTextActive]}>
                                    Mostrar Todos ({activeEmployees.length})
                                </Text>
                            </TouchableOpacity>

                            {selectedEmployees.length > 0 && (
                                <TouchableOpacity onPress={() => setSelectedEmployees([])}>
                                    <Text style={styles.filterClearText}>Limpar ({selectedEmployees.length})</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <ScrollView style={{ maxHeight: 300, marginVertical: 8 }}>
                            {modalFilteredEmployees.map(emp => {
                                const isSelected = selectedEmployees.includes(emp.nome);
                                const letraBadge = emp.letra === 'Ferista' ? 'FER' : emp.letra;
                                return (
                                    <TouchableOpacity 
                                        key={emp.id} 
                                        style={[styles.filterRowItem, isSelected && styles.filterRowItemActive]}
                                        onPress={() => toggleEmployeeSelection(emp.nome)}
                                    >
                                        <View style={styles.filterRowLeft}>
                                            <View style={[styles.filterCheckbox, isSelected && styles.filterCheckboxActive]}>
                                                {isSelected && <Text style={styles.filterCheckmark}>✓</Text>}
                                            </View>
                                            <Text style={[styles.filterRowLetraBadge, isSelected && { backgroundColor: COLORS.PRIMARY, color: '#fff' }]}>
                                                {letraBadge}
                                            </Text>
                                            <Text style={[styles.filterRowName, isSelected && styles.filterRowNameActive]}>
                                                {emp.nome}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        <TouchableOpacity 
                            style={styles.filterConfirmBtn}
                            onPress={() => setShowFilterModal(false)}
                        >
                            <Text style={styles.filterConfirmBtnText}>
                                {selectedEmployees.length === 0 
                                    ? "Visualizar Todos" 
                                    : `Aplicar (${selectedEmployees.length})`}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* MODAL DE OPÇÕES DO AGENDAMENTO (COM O NOVO LAYOUT DO EXEMPLO) */}
            <Modal visible={!!editingSchedule && !showConfirmDelete} transparent animationType="slide">
                <TouchableOpacity style={styles.modalOverlay} onPress={() => setEditingSchedule(null)}>
                    <View style={styles.editModalContent}>
                        {editingSchedule && (
                            <>
                                {(() => {
                                    const info = getStatusEDatas(editingSchedule);
                                    const emp = getEmployeeData(editingSchedule.employeeId || editingSchedule.employee_id);
                                    const letraBadge = emp.letra === 'Ferista' ? 'FER' : `Grupo ${emp.letra}`;
                                    const nomeCompleto = `${editingSchedule.employeeName || emp.nome} (${letraBadge})`;

                                    return (
                                        <>
                                            {/* Cabeçalho do Colaborador */}
                                            <View style={styles.exampleHeaderBox}>
                                                <Text style={styles.exampleHeaderTitle} numberOfLines={1}>{nomeCompleto}</Text>
                                            </View>

                                            {/* Bloco Saída Antecipada */}
                                            <View style={styles.exampleCardBlue}>
                                                <Text style={styles.exampleCardLabelCenter}>SAÍDA ANTECIPADA (FOLGA)</Text>
                                                <Text style={styles.exampleCardValueBlue}>{info.saida}</Text>
                                            </View>

                                            {/* Início Oficial & Último Dia (Lado a Lado) */}
                                            <View style={styles.exampleRowTwoCols}>
                                                <View style={styles.exampleCardWhiteCol}>
                                                    <Text style={styles.exampleCardLabel}>INÍCIO OFICIAL</Text>
                                                    <Text style={styles.exampleCardValueDark}>{info.inicio}</Text>
                                                </View>
                                                <View style={styles.exampleCardWhiteCol}>
                                                    <Text style={styles.exampleCardLabel}>ÚLTIMO DIA</Text>
                                                    <Text style={styles.exampleCardValueDark}>{info.fim}</Text>
                                                </View>
                                            </View>

                                            {/* Retorno ao Trabalho */}
                                            <View style={styles.exampleCardGreen}>
                                                <Text style={styles.exampleCardLabelCenterGreen}>RETORNO AO TRABALHO ({emp.letra === 'Ferista' ? 'FERISTA' : `1ª ESCALA`})</Text>
                                                <Text style={styles.exampleCardValueGreen}>{info.retorno}</Text>
                                            </View>
                                        </>
                                    );
                                })()}
                            </>
                        )}

                        <View style={{flexDirection: 'row', gap: 10, width: '100%', marginTop: 10}}>
                            <TouchableOpacity 
                                style={[styles.editBtn, {backgroundColor: '#FF9800', flex: 1}]} 
                                onPress={() => { 
                                    // PASSANDO O OBJETO COMPLETO COM O ID CORRETAMENTE PARA EDIÇÃO
                                    const dataParaEdicao = { ...editingSchedule }; 
                                    setEditingSchedule(null); 
                                    setTimeout(() => {
                                        if (onOpenSchedule) {
                                            onOpenSchedule(dataParaEdicao); 
                                        }
                                    }, 100);
                                }}
                            >
                                <Text style={styles.btnT}>EDITAR</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={[styles.editBtn, {backgroundColor: COLORS.DELETE, flex: 1}]} 
                                onPress={() => setShowConfirmDelete(true)}
                            >
                                <Text style={styles.btnT}>EXCLUIR</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* MODAL CONFIRMAR EXCLUSÃO */}
            <Modal visible={showConfirmDelete} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.confirmBox}>
                        <Text style={styles.confirmTitle}>Confirmar Exclusão?</Text>
                        <Text style={styles.confirmSub}>Deseja realmente remover este agendamento de férias?</Text>
                        <View style={{height: 10}} />
                        <View style={styles.confirmActions}>
                            <TouchableOpacity 
                                style={[styles.confirmBtn, {backgroundColor: '#eeeeee'}]} 
                                onPress={() => setShowConfirmDelete(false)}
                            >
                                <Text style={{fontWeight: 'bold', color: COLORS.TEXT}}>NÃO</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.confirmBtn, {backgroundColor: COLORS.DELETE}]} 
                                onPress={async () => { 
                                    if (onDeleteSchedules && editingSchedule) { 
                                        await onDeleteSchedules([editingSchedule.id]); 
                                    } 
                                    setShowConfirmDelete(false); 
                                    setEditingSchedule(null); 
                                }}
                            >
                                <Text style={styles.btnT}>SIM, EXCLUIR</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Header Principal Compacto */}
            <View style={styles.mainHeader}>
                <View>
                    <Text style={styles.mainTitle}>Equipe PHXP</Text>
                    <Text style={styles.mainSub}>{MONTHS[currentDate.getMonth()]} de {currentDate.getFullYear()}</Text>
                </View>
                <View style={styles.switchWrapper}>
                    <Text style={styles.switchLabel}>
                        {isCalendarTurnosView ? "Visão Diária" : "Linha do Tempo"}
                    </Text>
                    <Switch 
                        value={isCalendarTurnosView} 
                        onValueChange={setIsCalendarTurnosView} 
                        trackColor={{ false: "#3b5bdb", true: "#00c7b7" }} 
                        thumbColor={isCalendarTurnosView ? "#00897b" : "#4a61dd"}
                    />
                </View>
            </View>

            {/* BARRA SUPERIOR CLEAN */}
            <View style={styles.topBar}>
                <View style={styles.navRow}>
                    <TouchableOpacity style={styles.arrowBtn} onPress={() => changeMonth(-1)}><Text style={styles.arrowText}>◀</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.dateDisplay} onPress={() => setShowMonthPicker(true)}><Text style={styles.dateDisplayText}>{MONTHS[currentDate.getMonth()]}</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.yearDisplay} onPress={() => setShowYearPicker(true)}><Text style={styles.dateDisplayText}>{currentDate.getFullYear()}</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.arrowBtn} onPress={() => changeMonth(1)}><Text style={styles.arrowText}>▶</Text></TouchableOpacity>

                    <TouchableOpacity 
                        style={[styles.filterTriggerBtn, selectedEmployees.length > 0 && styles.filterTriggerBtnActive]}
                        onPress={() => setShowFilterModal(true)}
                    >
                        <Text style={[styles.filterTriggerText, selectedEmployees.length > 0 && styles.filterTriggerTextActive]}>
                            🔍 {selectedEmployees.length === 0 ? "Filtrar" : `Filtro (${selectedEmployees.length})`}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* CONTEÚDO PRINCIPAL */}
            <View style={{ flex: 1 }}>
                {!isCalendarTurnosView ? (
                    <>
                        <View style={styles.stickyHeaderContainer}>
                            <View style={styles.namesHeaderCorner}>
                                <Text style={{fontSize: 10, color: COLORS.MUTED, fontWeight: 'bold'}}>
                                    ESCALA / COLAB. ({employeesInTimeline.length})
                                </Text>
                            </View>
                            <ScrollView horizontal ref={headerScrollRef} scrollEnabled={false} showsHorizontalScrollIndicator={false} style={styles.headerScroll}>
                                <View style={styles.daysHeader}>
                                    {timelineDays.map(d => (
                                        <View key={d.getTime()} style={styles.dayBox}>
                                            <Text style={styles.dayLabel}>{String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')}</Text>
                                        </View>
                                    ))}
                                </View>
                            </ScrollView>
                        </View>
                        <ScrollView style={{flex: 1}} contentContainerStyle={{flexGrow: 1}}>
                            <View style={styles.mainTimelineContainer}>
                                <View style={styles.namesColumn}>
                                    {employeesInTimeline.map(item => (
                                        <View key={item.id} style={styles.nameRow}>
                                            <View style={styles.nameRowHeader}>
                                                <Text style={styles.letraBadge}>{item.letra === 'Ferista' ? 'FER' : item.letra}</Text>
                                                <Text style={styles.nameText} numberOfLines={1}>{item.nome}</Text>
                                            </View>
                                            <Text style={styles.escalaDescText}>
                                                {item.letra === 'Ferista' ? 'VOLANTE / FERISTA' : `TURNO LETRA ${item.letra}`}
                                            </Text>
                                        </View>
                                    ))}
                                    {employeesInTimeline.length === 0 && (
                                        <View style={{ padding: 15 }}>
                                            <Text style={{ fontSize: 11, color: COLORS.MUTED }}>Nenhum encontrado</Text>
                                        </View>
                                    )}
                                </View>
                                <ScrollView horizontal ref={gridScrollRef} style={styles.gridScroll} onScroll={handleGridScroll} scrollEventThrottle={16}>
                                    <View>
                                        {employeesInTimeline.map(emp => (
                                            <View key={emp.id} style={styles.row}>
                                                {timelineDays.map(d => <View key={d.getTime()} style={[styles.cell, getScaleStyle(d, emp)]} />)}
                                                
                                                {(schedules || [])
                                                    .filter(s => (s.employeeId || s.employee_id) === emp.id)
                                                    .map(sch => {
                                                        const start = parseSafeDate(sch.startDate || sch.data_inicio); 
                                                        let end = parseSafeDate(sch.endDate || sch.data_fim);
                                                        if (!end && start) {
                                                            const dur = parseInt(sch.durationDays || sch.dias || 30, 10);
                                                            end = new Date(start);
                                                            end.setDate(end.getDate() + (dur - 1));
                                                        }

                                                        if (!start || !end) return null;
                                                        let startIdx = timelineDays.findIndex(d => d.getTime() === start.getTime());
                                                        let endIdx = timelineDays.findIndex(d => d.getTime() === end.getTime());
                                                        if (endIdx === -1 && end < timelineDays[0]) return null;
                                                        if (startIdx === -1 && start > timelineDays[timelineDays.length - 1]) return null;
                                                        const effStart = startIdx === -1 ? 0 : startIdx;
                                                        const effEnd = endIdx === -1 ? timelineDays.length - 1 : endIdx;

                                                        return (
                                                            <TouchableOpacity 
                                                                key={sch.id} 
                                                                onPress={() => setEditingSchedule(sch)} 
                                                                style={[
                                                                    styles.bar, 
                                                                    { 
                                                                        left: effStart * DAY_WIDTH, 
                                                                        width: (effEnd - effStart + 1) * DAY_WIDTH, 
                                                                        backgroundColor: COLORS.VACATION 
                                                                    }
                                                                ]}
                                                            >
                                                                <Text style={styles.barText} numberOfLines={1}>FÉRIAS 🏖️</Text>
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                            </View>
                                        ))}
                                    </View>
                                </ScrollView>
                            </View>
                        </ScrollView>
                    </>
                ) : (
                    <ScrollView style={{ flex: 1 }}>
                        <View style={styles.weekHeader}>
                            {WEEK_DAYS.map(w => (
                                <View key={w} style={styles.weekHeaderCell}>
                                    <Text style={styles.weekHeaderText}>{w}</Text>
                                </View>
                            ))}
                        </View>

                        <View style={styles.calendarGrid}>
                            {calendarGridDays.map((dateObj, i) => {
                                const k = formatDateKey(dateObj);
                                const dadosDoDia = dailyRosterMap[k] || { day: [], night: [], adm: [], vacations: [], dayLetra: 'A', nightLetra: 'B' };
                                const isCurrentMonth = dateObj.getMonth() === currentDate.getMonth();

                                const isFilterActive = selectedEmployees.length > 0;

                                const hasSelectedInDay = selectedEmployees.some(nome => dadosDoDia.day.includes(nome));
                                const hasSelectedInNight = selectedEmployees.some(nome => dadosDoDia.night.includes(nome));
                                const hasSelectedInAdm = selectedEmployees.some(nome => dadosDoDia.adm.includes(nome));
                                const hasSelectedInVacation = selectedEmployees.some(nome => dadosDoDia.vacations.some(v => v.name === nome));

                                const showDayBox = isFilterActive ? hasSelectedInDay : true;
                                const showNightBox = isFilterActive ? hasSelectedInNight : true;
                                const showAdmBox = isFilterActive ? hasSelectedInAdm : (dadosDoDia.adm.length > 0);
                                const showVacationBox = isFilterActive ? hasSelectedInVacation : (dadosDoDia.vacations.length > 0);

                                const anyActivityToday = showDayBox || showNightBox || showAdmBox || showVacationBox;

                                return (
                                    <View 
                                        key={k + i} 
                                        style={[
                                            styles.calendarDayCell,
                                            !isCurrentMonth && { opacity: 0.35 },
                                            isFilterActive && anyActivityToday && styles.calendarDayCellHighlighted,
                                            isFilterActive && !anyActivityToday && styles.calendarDayCellOff
                                        ]}
                                    >
                                        <View style={styles.dayNumberRow}>
                                            <Text style={[
                                                styles.dayNumberText, 
                                                isFilterActive && anyActivityToday && styles.dayNumberHighlighted
                                            ]}>
                                                {dateObj.getDate()}
                                            </Text>
                                        </View>

                                        {showDayBox && (
                                            <View style={[styles.shiftBlock, { backgroundColor: COLORS.WORK_DAY }]}>
                                                <View style={styles.shiftHeaderRow}>
                                                    <Text style={styles.shiftTitle}>☀️ DIA 6hX18h</Text>
                                                    <View style={styles.shiftBadge}>
                                                        <Text style={styles.shiftBadgeText}>{dadosDoDia.dayLetra}</Text>
                                                    </View>
                                                </View>
                                                {dadosDoDia.day.length > 0 ? (
                                                    dadosDoDia.day.map((nome, idx) => {
                                                        const isTarget = isFilterActive && selectedEmployees.includes(nome);
                                                        return (
                                                            <View key={idx} style={[styles.personItem, isTarget && styles.personItemTarget]}>
                                                                <Text style={[styles.personName, isTarget && styles.personNameTarget]} numberOfLines={1}>
                                                                    {isTarget ? '★ ' : '• '}{nome}
                                                                </Text>
                                                            </View>
                                                        );
                                                    })
                                                ) : (
                                                    <Text style={styles.emptyShiftText}>--</Text>
                                                )}
                                            </View>
                                        )}

                                        {showNightBox && (
                                            <View style={[styles.shiftBlock, { backgroundColor: COLORS.WORK_NIGHT, marginTop: showDayBox ? 4 : 0 }]}>
                                                <View style={styles.shiftHeaderRow}>
                                                    <Text style={styles.shiftTitle}>🌙 NOITE 18hX6h</Text>
                                                    <View style={styles.shiftBadge}>
                                                        <Text style={styles.shiftBadgeText}>{dadosDoDia.nightLetra}</Text>
                                                    </View>
                                                </View>
                                                {dadosDoDia.night.length > 0 ? (
                                                    dadosDoDia.night.map((nome, idx) => {
                                                        const isTarget = isFilterActive && selectedEmployees.includes(nome);
                                                        return (
                                                            <View key={idx} style={[styles.personItem, isTarget && styles.personItemTarget]}>
                                                                <Text style={[styles.personName, isTarget && styles.personNameTarget]} numberOfLines={1}>
                                                                    {isTarget ? '★ ' : '• '}{nome}
                                                                </Text>
                                                            </View>
                                                        );
                                                    })
                                                ) : (
                                                    <Text style={styles.emptyShiftText}>--</Text>
                                                )}
                                            </View>
                                        )}

                                        {showAdmBox && (
                                            <View style={[styles.shiftBlock, { backgroundColor: COLORS.ADM_WORK, marginTop: (showDayBox || showNightBox) ? 4 : 0 }]}>
                                                <View style={styles.shiftHeaderRow}>
                                                    <Text style={styles.shiftTitle}>💼 ADM 8h-17h</Text>
                                                    <View style={styles.shiftBadge}>
                                                        <Text style={styles.shiftBadgeText}>ADM</Text>
                                                    </View>
                                                </View>
                                                {dadosDoDia.adm.map((nome, idx) => {
                                                    const isTarget = isFilterActive && selectedEmployees.includes(nome);
                                                    return (
                                                        <View key={idx} style={[styles.personItem, isTarget && styles.personItemTarget]}>
                                                            <Text style={[styles.personName, isTarget && styles.personNameTarget]} numberOfLines={1}>
                                                                {isTarget ? '★ ' : '• '}{nome}
                                                            </Text>
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        )}

                                        {showVacationBox && (
                                            <View style={[styles.shiftBlock, { backgroundColor: COLORS.VACATION, marginTop: 4 }]}>
                                                <View style={styles.shiftHeaderRow}>
                                                    <Text style={styles.shiftTitle}>🏖️ FÉRIAS</Text>
                                                </View>
                                                {dadosDoDia.vacations.map((vac, idx) => (
                                                    <TouchableOpacity 
                                                        key={idx} 
                                                        style={styles.vacationPersonButton}
                                                        onPress={() => setEditingSchedule(vac.schedule)}
                                                    >
                                                        <Text style={styles.vacationPersonName} numberOfLines={1}>
                                                            🏖️ [{vac.letra === 'Ferista' ? 'FER' : vac.letra}] {vac.name}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        )}

                                        {isFilterActive && !anyActivityToday && (
                                            <View style={styles.offIndicatorBox}>
                                                <Text style={styles.offIndicatorText}>FOLGA</Text>
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    </ScrollView>
                )}
            </View>

            {/* Rodapé */}
            <View style={styles.footer}>
                <TouchableOpacity style={[styles.btn, {backgroundColor: COLORS.PRIMARY}]} onPress={onOpenRegister}>
                    <Text style={styles.btnT}>+ Func</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, {backgroundColor: COLORS.SAVE}]} onPress={() => onOpenSchedule(null)}>
                    <Text style={styles.btnT}>Agendar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, {backgroundColor: COLORS.VIEW}]} onPress={onOpenMonthly}>
                    <Text style={styles.btnT}>Mensal</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.BG },
    mainHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: COLORS.LINE },
    mainTitle: { fontSize: 17, fontWeight: 'bold' },
    mainSub: { fontSize: 11, color: COLORS.MUTED },
    switchWrapper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    switchLabel: { fontSize: 11, fontWeight: 'bold', color: COLORS.TEXT },

    topBar: { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: COLORS.LINE },
    navRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    arrowBtn: { paddingVertical: 7, paddingHorizontal: 10, backgroundColor: '#f9f9f9', borderRadius: 8, borderWidth: 1, borderColor: COLORS.LINE },
    arrowText: { color: COLORS.PRIMARY, fontWeight: 'bold', fontSize: 11 },
    dateDisplay: { flex: 2, paddingVertical: 7, backgroundColor: '#f9f9f9', borderRadius: 8, borderWidth: 1, borderColor: COLORS.LINE, justifyContent: 'center', alignItems: 'center' },
    yearDisplay: { flex: 1.2, paddingVertical: 7, backgroundColor: '#f9f9f9', borderRadius: 8, borderWidth: 1, borderColor: COLORS.LINE, justifyContent: 'center', alignItems: 'center' },
    dateDisplayText: { color: COLORS.PRIMARY, fontWeight: 'bold', fontSize: 12 },

    filterTriggerBtn: {
        flex: 1.8,
        paddingVertical: 7,
        paddingHorizontal: 8,
        backgroundColor: '#f0f3f6',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#dcdfe3',
        alignItems: 'center',
        justifyContent: 'center'
    },
    filterTriggerBtnActive: {
        backgroundColor: '#e8edfb',
        borderColor: COLORS.PRIMARY
    },
    filterTriggerText: {
        fontSize: 11,
        fontWeight: 'bold',
        color: COLORS.TEXT
    },
    filterTriggerTextActive: {
        color: COLORS.PRIMARY
    },

    filterPopupCard: {
        backgroundColor: '#fff',
        width: '90%',
        maxWidth: 380,
        borderRadius: 16,
        padding: 16,
        elevation: 5
    },
    filterPopupHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10
    },
    filterPopupTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.TEXT
    },
    filterSearchInput: {
        backgroundColor: '#f8f9fa',
        borderWidth: 1,
        borderColor: COLORS.LINE,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 12,
        marginBottom: 8
    },
    filterQuickActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6
    },
    filterQuickBtn: {
        backgroundColor: '#f0f3f6',
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 6
    },
    filterQuickBtnActive: {
        backgroundColor: COLORS.PRIMARY
    },
    filterQuickBtnText: {
        fontSize: 11,
        fontWeight: 'bold',
        color: COLORS.MUTED
    },
    filterQuickBtnTextActive: {
        color: '#fff'
    },
    filterClearText: {
        fontSize: 11,
        fontWeight: 'bold',
        color: COLORS.DELETE
    },
    filterRowItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderBottomWidth: 0.5,
        borderBottomColor: '#edf0f2',
        borderRadius: 6
    },
    filterRowItemActive: {
        backgroundColor: '#f4f7fd'
    },
    filterRowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1
    },
    filterCheckbox: {
        width: 18,
        height: 18,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: '#b0bec5',
        alignItems: 'center',
        justifyContent: 'center'
    },
    filterCheckboxActive: {
        backgroundColor: COLORS.PRIMARY,
        borderColor: COLORS.PRIMARY
    },
    filterCheckmark: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold'
    },
    filterRowLetraBadge: {
        backgroundColor: '#eef2ff',
        color: COLORS.PRIMARY,
        fontWeight: 'bold',
        fontSize: 9,
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 4
    },
    filterRowName: {
        fontSize: 12,
        color: COLORS.TEXT,
        flex: 1
    },
    filterRowNameActive: {
        fontWeight: 'bold',
        color: COLORS.PRIMARY
    },
    filterConfirmBtn: {
        backgroundColor: COLORS.PRIMARY,
        borderRadius: 8,
        paddingVertical: 11,
        alignItems: 'center',
        marginTop: 10
    },
    filterConfirmBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12
    },

    weekHeader: { flexDirection: 'row', backgroundColor: COLORS.HEADER, borderBottomWidth: 1, borderColor: COLORS.LINE },
    weekHeaderCell: { flex: 1, alignItems: 'center', paddingVertical: 6 },
    weekHeaderText: { fontSize: 11, fontWeight: 'bold', color: COLORS.MUTED },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#fff' },
    calendarDayCell: { width: '14.28%', minHeight: 140, borderWidth: 0.5, borderColor: COLORS.LINE, padding: 3, backgroundColor: '#fff' },
    calendarDayCellHighlighted: { backgroundColor: COLORS.HIGHLIGHT_BG, borderColor: COLORS.HIGHLIGHT_BORDER, borderWidth: 2 },
    calendarDayCellOff: { backgroundColor: '#fafafa' },
    dayNumberRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 2 },
    dayNumberText: { fontSize: 11, fontWeight: 'bold', color: COLORS.TEXT },
    dayNumberHighlighted: { color: COLORS.HIGHLIGHT_BORDER, fontSize: 13, fontWeight: '900' },
    
    offIndicatorBox: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 75 },
    offIndicatorText: { fontSize: 10, fontWeight: 'bold', color: '#b0bec5', letterSpacing: 1 },

    shiftBlock: { borderRadius: 4, padding: 3 },
    shiftHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    shiftTitle: { fontSize: 10, fontWeight: 'bold', color: '#fff', opacity: 0.95 },
    shiftBadge: { backgroundColor: 'rgba(255, 255, 255, 0.22)', paddingHorizontal: 4, paddingVertical: 0.5, borderRadius: 3 },
    shiftBadgeText: { fontSize: 20, fontWeight: '900', color: '#ffffff' },

    personItem: { paddingVertical: 1, paddingHorizontal: 2, borderRadius: 3 },
    personItemTarget: { backgroundColor: 'rgba(255, 255, 255, 0.35)' },
    personName: { fontSize: 11, fontWeight: 'bold', color: '#ffffff' },
    personNameTarget: { color: '#FFE082', fontWeight: '900' },
    emptyShiftText: { fontSize: 8, color: '#fff', opacity: 0.5, fontStyle: 'italic' },

    vacationPersonButton: { backgroundColor: 'rgba(0, 0, 0, 0.2)', paddingVertical: 2, paddingHorizontal: 4, borderRadius: 4, marginTop: 2 },
    vacationPersonName: { fontSize: 10, fontWeight: 'bold', color: '#ffffff' },

    stickyHeaderContainer: { flexDirection: 'row', height: 40, borderBottomWidth: 1, borderColor: COLORS.LINE, backgroundColor: COLORS.HEADER, zIndex: 10 },
    namesHeaderCorner: { width: 155, borderRightWidth: 1, borderColor: COLORS.LINE, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
    headerScroll: { flex: 1 },
    mainTimelineContainer: { flexDirection: 'row' },
    namesColumn: { width: 155, borderRightWidth: 1, borderColor: COLORS.LINE, backgroundColor: '#fff', zIndex: 5 },
    gridScroll: { flex: 1 },
    nameRow: { height: ROW_HEIGHT, paddingHorizontal: 8, paddingVertical: 5, borderBottomWidth: 1, borderColor: COLORS.LINE, justifyContent: 'center' },
    nameRowHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    letraBadge: { backgroundColor: '#eef2ff', color: COLORS.PRIMARY, fontWeight: 'bold', fontSize: 10, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
    nameText: { fontWeight: 'bold', fontSize: 12, flex: 1, color: COLORS.TEXT },
    escalaDescText: { fontSize: 8, color: COLORS.MUTED, marginTop: 2, marginLeft: 2 },
    daysHeader: { flexDirection: 'row', height: 40, backgroundColor: COLORS.HEADER }, 
    dayBox: { width: DAY_WIDTH, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: COLORS.LINE },
    dayLabel: { fontSize: 10, fontWeight: 'bold', color: COLORS.TEXT }, 
    row: { height: ROW_HEIGHT, flexDirection: 'row', borderBottomWidth: 1, borderColor: COLORS.LINE, position: 'relative' },
    cell: { width: DAY_WIDTH, height: '100%', borderRightWidth: 1, borderColor: COLORS.LINE },
    bar: { position: 'absolute', height: 38, top: (ROW_HEIGHT - 38) / 2, borderRadius: 6, justifyContent: 'center', alignItems: 'center', zIndex: 10, elevation: 3 },
    barText: { color: '#fff', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 4 },

    footer: { padding: 10, flexDirection: 'row', gap: 8, backgroundColor: '#fff', borderTopWidth: 1, borderColor: COLORS.LINE },
    btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    btnT: { color: '#fff', fontWeight: 'bold', fontSize: 11 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#fff', width: '40%', borderRadius: 12, padding: 10 },
    modalItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: COLORS.LINE },
    modalText: { textAlign: 'center', fontSize: 16 },

    // Estilos do Modal Estilo Exemplo
    editModalContent: { backgroundColor: '#fff', width: '92%', maxWidth: 440, borderRadius: 16, padding: 16, alignItems: 'center' },
    
    exampleHeaderBox: {
        width: '100%',
        backgroundColor: '#fff',
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: COLORS.LINE
    },
    exampleHeaderTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: COLORS.TEXT
    },
    
    exampleCardBlue: {
        width: '100%',
        backgroundColor: '#EBF3FE',
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#D0E3FF'
    },
    exampleCardLabelCenter: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#5C7CAE',
        marginBottom: 4,
        letterSpacing: 0.5
    },
    exampleCardValueBlue: {
        fontSize: 16,
        fontWeight: '900',
        color: '#3B64D8'
    },

    exampleRowTwoCols: {
        flexDirection: 'row',
        gap: 10,
        width: '100%',
        marginBottom: 10
    },
    exampleCardWhiteCol: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.LINE
    },
    exampleCardLabel: {
        fontSize: 9,
        fontWeight: 'bold',
        color: COLORS.MUTED,
        marginBottom: 4,
        letterSpacing: 0.5
    },
    exampleCardValueDark: {
        fontSize: 15,
        fontWeight: 'bold',
        color: COLORS.TEXT
    },

    exampleCardGreen: {
        width: '100%',
        backgroundColor: '#E8F5E9',
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#C8E6C9'
    },
    exampleCardLabelCenterGreen: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#2E7D32',
        marginBottom: 4,
        letterSpacing: 0.5
    },
    exampleCardValueGreen: {
        fontSize: 16,
        fontWeight: '900',
        color: '#2E7D32'
    },

    editBtn: { padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

    confirmBox: { backgroundColor: '#fff', width: '85%', maxWidth: 360, padding: 20, borderRadius: 16, alignItems: 'center' },
    confirmTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.DELETE, marginBottom: 8 },
    confirmSub: { fontSize: 12, color: COLORS.MUTED, textAlign: 'center', marginBottom: 18 },
    confirmActions: { flexDirection: 'row', gap: 10, width: '100%' },
    confirmBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }
});