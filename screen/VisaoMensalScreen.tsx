import React, { useState, useMemo } from 'react';
import { 
    SafeAreaView, View, Text, TouchableOpacity, 
    StyleSheet, ScrollView 
} from 'react-native';

const COLORS = {
    BG: '#f4f7f6',
    HEADER: '#ffffff',
    LINE: '#e0e0e0',
    TEXT: '#222222',
    MUTED: '#666666',
    PRIMARY: '#4a61dd',
    VACATION: '#C00000',
    CARD_BG: '#ffffff',
    TAG_BG: '#ffebee',
    TAG_TEXT: '#c62828',
    BLOCK_HEADER: '#f8fafd'
};

const MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, index) => (CURRENT_YEAR - 2) + index);

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

const formatBR = (date) => {
    if (!date) return '--/--';
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}`;
};

export default function VisaoMensalScreen({ employees = [], schedules = [], onBack }) {
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const getEmployee = (empId) => {
        return employees.find(e => e.id === empId) || {};
    };

    const yearlyOverview = useMemo(() => {
        return MONTHS.map((monthName, monthIndex) => {
            const startOfMonth = new Date(selectedYear, monthIndex, 1, 0, 0, 0);
            const endOfMonth = new Date(selectedYear, monthIndex + 1, 0, 23, 59, 59);

            const monthSchedules = (schedules || []).filter(sch => {
                const st = parseDateSafe(sch.data_inicio || sch.startDate);
                let en = parseDateSafe(sch.data_fim || sch.endDate);

                if (!en && st) {
                    const days = parseInt(sch.durationDays || sch.dias || 30, 10);
                    en = new Date(st);
                    en.setDate(en.getDate() + (days - 1));
                }

                if (!st || !en) return false;
                return st <= endOfMonth && en >= startOfMonth;
            }).map(sch => {
                const emp = getEmployee(sch.employee_id || sch.employeeId);
                const st = parseDateSafe(sch.data_inicio || sch.startDate);
                let en = parseDateSafe(sch.data_fim || sch.endDate);
                if (!en && st) {
                    const days = parseInt(sch.durationDays || sch.dias || 30, 10);
                    en = new Date(st);
                    en.setDate(en.getDate() + (days - 1));
                }

                const isCrossing = st?.getMonth() !== en?.getMonth() || st?.getFullYear() !== en?.getFullYear();

                return {
                    ...sch,
                    empName: sch.employeeName || emp.nome || 'Colaborador',
                    empLetra: emp.letra || 'A',
                    startDateObj: st,
                    endDateObj: en,
                    isCrossing
                };
            }).sort((a, b) => (a.startDateObj?.getTime() || 0) - (b.startDateObj?.getTime() || 0));

            return {
                monthIndex,
                monthName,
                schedules: monthSchedules
            };
        });
    }, [schedules, employees, selectedYear]);

    return (
        <SafeAreaView style={styles.container}>
            {/* Topo */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>◀ Voltar</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Visão Anual em Blocos</Text>
                <View style={{ width: 60 }} />
            </View>

            {/* Seletor de Ano */}
            <View style={styles.yearBar}>
                <Text style={styles.yearBarLabel}>Ano:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 6 }}>
                    {YEARS.map(y => {
                        const isSelected = selectedYear === y;
                        return (
                            <TouchableOpacity 
                                key={y} 
                                style={[styles.yearChip, isSelected && styles.yearChipActive]}
                                onPress={() => setSelectedYear(y)}
                            >
                                <Text style={[styles.yearChipText, isSelected && styles.yearChipTextActive]}>{y}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Grade dos 12 Blocos de Meses em 3 Colunas */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.blocksGridContainer}>
                {yearlyOverview.map(monthData => (
                    <View key={monthData.monthIndex} style={styles.monthBlock}>
                        {/* Topo do Bloco do Mês */}
                        <View style={styles.monthBlockHeader}>
                            <Text style={styles.monthBlockTitle} numberOfLines={1}>
                                {monthData.monthName}
                            </Text>
                            <View style={[
                                styles.badgeCount,
                                monthData.schedules.length === 0 && { backgroundColor: '#f0f0f0' }
                            ]}>
                                <Text style={[
                                    styles.badgeCountText,
                                    monthData.schedules.length === 0 && { color: COLORS.MUTED }
                                ]}>
                                    {monthData.schedules.length}
                                </Text>
                            </View>
                        </View>

                        {/* Conteúdo do Bloco */}
                        <View style={styles.monthBlockContent}>
                            {monthData.schedules.length > 0 ? (
                                monthData.schedules.map(item => (
                                    <View key={item.id + '_' + monthData.monthIndex} style={styles.employeeMiniCard}>
                                        <View style={styles.empHeaderRow}>
                                            <Text style={styles.empNameText} numberOfLines={1}>
                                                {item.empName}
                                            </Text>
                                            <Text style={styles.empLetraText}>
                                                {item.empLetra === 'Ferista' ? 'FER' : item.empLetra}
                                            </Text>
                                        </View>

                                        <View style={styles.empDatesRow}>
                                            <Text style={styles.datesRangeText}>
                                                {formatBR(item.startDateObj)} - {formatBR(item.endDateObj)}
                                            </Text>
                                            <Text style={styles.daysTotalText}>
                                                {item.durationDays || item.dias || 30}d
                                            </Text>
                                        </View>

                                        {item.isCrossing && (
                                            <View style={styles.crossingBadgeMini}>
                                                <Text style={styles.crossingBadgeMiniText}>Prox. Mês</Text>
                                            </View>
                                        )}
                                    </View>
                                ))
                            ) : (
                                <View style={styles.emptyBlock}>
                                    <Text style={styles.emptyBlockText}>Sem férias</Text>
                                </View>
                            )}
                        </View>
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.BG },
    header: { 
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
        paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.HEADER, 
        borderBottomWidth: 1, borderColor: COLORS.LINE 
    },
    backBtn: { backgroundColor: '#eef2ff', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
    backBtnText: { color: COLORS.PRIMARY, fontWeight: 'bold', fontSize: 12 },
    headerTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.TEXT },

    // Barra de Ano
    yearBar: { 
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', 
        paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: COLORS.LINE 
    },
    yearBarLabel: { fontSize: 13, fontWeight: 'bold', color: COLORS.MUTED, marginRight: 8 },
    yearChip: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0f3f6', marginRight: 8 },
    yearChipActive: { backgroundColor: COLORS.PRIMARY },
    yearChipText: { fontSize: 13, fontWeight: '600', color: COLORS.TEXT },
    yearChipTextActive: { color: '#ffffff', fontWeight: 'bold' },

    // Grid de Blocos em 3 Colunas
    blocksGridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        padding: 8,
        paddingBottom: 50
    },
    monthBlock: {
        width: '32%', // Exatamente 3 colunas por linha
        backgroundColor: '#ffffff',
        borderRadius: 10,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: COLORS.LINE,
        elevation: 1,
        overflow: 'hidden'
    },
    monthBlockHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: COLORS.BLOCK_HEADER,
        paddingHorizontal: 8,
        paddingVertical: 7,
        borderBottomWidth: 1,
        borderColor: '#e8edf3'
    },
    monthBlockTitle: { fontSize: 12, fontWeight: 'bold', color: COLORS.TEXT, flex: 1 },
    badgeCount: { backgroundColor: '#eef2ff', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 8 },
    badgeCountText: { fontSize: 9, fontWeight: 'bold', color: COLORS.PRIMARY },

    monthBlockContent: { padding: 6 },
    
    // Mini Card do Funcionário dentro do Bloco
    employeeMiniCard: {
        backgroundColor: '#fafbfc',
        borderRadius: 6,
        padding: 6,
        marginBottom: 5,
        borderLeftWidth: 3,
        borderLeftColor: COLORS.VACATION,
        borderWidth: 0.5,
        borderColor: '#e5e9f0'
    },
    empHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    empNameText: { fontSize: 10, fontWeight: 'bold', color: COLORS.TEXT, flex: 1, marginRight: 2 },
    empLetraText: { fontSize: 8, fontWeight: 'bold', color: COLORS.PRIMARY, backgroundColor: '#eef2ff', paddingHorizontal: 3, paddingVertical: 0.5, borderRadius: 3 },

    empDatesRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    datesRangeText: { fontSize: 9, color: COLORS.MUTED, fontWeight: '600' },
    daysTotalText: { fontSize: 9, fontWeight: 'bold', color: COLORS.PRIMARY },

    crossingBadgeMini: {
        alignSelf: 'flex-start',
        backgroundColor: COLORS.TAG_BG,
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 3,
        marginTop: 3
    },
    crossingBadgeMiniText: { color: COLORS.TAG_TEXT, fontSize: 7, fontWeight: 'bold' },

    emptyBlock: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    emptyBlockText: { fontSize: 10, color: '#b0bec5', fontStyle: 'italic' }
});