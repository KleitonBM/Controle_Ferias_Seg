import React, { useState, useEffect } from 'react';
import {
    SafeAreaView, View, Text, TextInput, TouchableOpacity,
    StyleSheet, ScrollView, Alert, Switch
} from 'react-native';

const COLORS = {
    BG: '#ffffff', HEADER: '#f8f8f8', LINE: '#eeeeee',
    TEXT: '#333', MUTED: '#666', PRIMARY: '#4a61dd',
    SAVE: '#4CAF50', CANCEL: '#666', INPUT_BG: '#f9f9f9',
    SUCCESS: '#1b5e20', ERROR: '#d32f2f', WARNING: '#ff9800'
};

const SCALE_ANCHOR = new Date(2025, 11, 27); 

// Converte qualquer data (AAAA-MM-DD ou DD/MM/AAAA) para DD/MM/AAAA inicial do input
const formatInitialDate = (raw) => {
    if (!raw) return '';
    const clean = String(raw).split('T')[0];
    if (clean.includes('-')) {
        const [y, m, d] = clean.split('-');
        return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
    return clean;
};

// Converte texto com segurança para Date objeto sem risco de NaN
const parseSafeToDate = (str) => {
    if (!str || str.length < 10) return null;
    try {
        if (str.includes('/')) {
            const [d, m, y] = str.split('/').map(Number);
            const dt = new Date(y, m - 1, d);
            dt.setHours(0, 0, 0, 0);
            return isNaN(dt.getTime()) ? null : dt;
        }
        if (str.includes('-')) {
            const [y, m, d] = str.split('-').map(Number);
            const dt = new Date(y, m - 1, d);
            dt.setHours(0, 0, 0, 0);
            return isNaN(dt.getTime()) ? null : dt;
        }
    } catch (e) {
        return null;
    }
    return null;
};

const formatDateBR = (date) => {
    if (!date || isNaN(date.getTime())) return '';
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
};

export default function EdicaoFeriasScreen({ scheduleToEdit, employees, schedules, onUpdate, onCancel }) {
    if (!scheduleToEdit) return null;

    const empId = scheduleToEdit.employee_id || scheduleToEdit.employeeId;
    const selectedEmp = (employees || []).find(e => e.id === empId);

    const initialDate = formatInitialDate(scheduleToEdit.data_inicio || scheduleToEdit.startDate);
    const initialDuration = String(scheduleToEdit.duration_days || scheduleToEdit.durationDays || scheduleToEdit.dias || '30');

    const [startDate, setStartDate] = useState(initialDate); 
    const [duration, setDuration] = useState(initialDuration);
    const [venderDezDias, setVenderDezDias] = useState(scheduleToEdit.abonoPecuniario || false); 
    
    const [calcData, setCalcData] = useState({ 
        saidaReal: '', inicioOficial: '', termino: '', retorno: '', 
        proximaDisponivel: '', erroFolga: false, erroGeral: '' 
    });

    const handleDateChange = (text) => {
        let v = text.replace(/\D/g, '');
        if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
        if (v.length > 5) v = v.slice(0, 5) + '/' + v.slice(5, 9);
        setStartDate(v);
    };

    const getDayStatus = (date) => {
        if (!date || isNaN(date.getTime())) return 'TRABALHO';
        const d = new Date(date);
        d.setHours(0,0,0,0);
        const diffTime = d.getTime() - SCALE_ANCHOR.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const cycleDay = ((diffDays % 8) + 8) % 8;
        return cycleDay < 4 ? 'TRABALHO' : 'FOLGA';
    };

    const validarRegrasRigorosas = (emp, dataInicio, diasGozados, diasVenda) => {
        if (!emp || !dataInicio || isNaN(dataInicio.getTime())) return { ok: false, msg: '' };

        if (emp.admissao) {
            const partes = String(emp.admissao).split(/[-/]/);
            if (partes.length >= 3) {
                const adm = new Date(
                    partes[0].length === 4 ? partes[0] : partes[2], 
                    partes[1] - 1, 
                    partes[0].length === 4 ? partes[2] : partes[0]
                );

                let ciclo = dataInicio.getFullYear() - adm.getFullYear();
                if (dataInicio.getMonth() < adm.getMonth() || (dataInicio.getMonth() === adm.getMonth() && dataInicio.getDate() < adm.getDate())) {
                    ciclo--;
                }

                if (ciclo < 1) return { ok: false, msg: "Período aquisitivo ainda não completado." };

                const duplicado = (schedules || []).some(s => {
                    if (s.id === scheduleToEdit.id) return false;
                    const dS = parseSafeToDate(s.startDate || s.data_inicio);
                    if (!dS) return false;
                    let cicloS = dS.getFullYear() - adm.getFullYear();
                    if (dS.getMonth() < adm.getMonth() || (dS.getMonth() === adm.getMonth() && dS.getDate() < adm.getDate())) cicloS--;
                    return cicloS === ciclo;
                });

                if (duplicado) return { ok: false, msg: `Já existe outro agendamento diferente para o ciclo de ${dataInicio.getFullYear()}.` };
            }
        }

        if ((diasGozados + diasVenda) > 30) return { ok: false, msg: "Soma de gozo e venda excede 30 dias." };

        return { ok: true, msg: '' };
    };

    useEffect(() => {
        const userDate = parseSafeToDate(startDate);
        const durInt = parseInt(duration, 10);

        if (userDate && !isNaN(userDate.getTime()) && durInt > 0) {
            const check = validarRegrasRigorosas(selectedEmp, userDate, durInt, venderDezDias ? 10 : 0);
            
            const isFolga = getDayStatus(userDate) === 'FOLGA';
            let proxima = '';

            if (isFolga) {
                let busca = new Date(userDate);
                let safeCount = 0;
                while (getDayStatus(busca) === 'FOLGA' && safeCount < 10) {
                    busca.setDate(busca.getDate() + 1);
                    safeCount++;
                }
                proxima = formatDateBR(busca);
            }

            let sObj = new Date(userDate);
            sObj.setDate(sObj.getDate() - 1);
            let safeS = 0;
            while (getDayStatus(sObj) === 'FOLGA' && safeS < 10) {
                sObj.setDate(sObj.getDate() - 1);
                safeS++;
            }
            sObj.setDate(sObj.getDate() + 1);

            const tObj = new Date(userDate);
            tObj.setDate(tObj.getDate() + durInt - 1);

            let rObj = new Date(tObj);
            rObj.setDate(rObj.getDate() + 1);
            let safeR = 0;
            while (getDayStatus(rObj) !== 'TRABALHO' && safeR < 10) {
                rObj.setDate(rObj.getDate() + 1);
                safeR++;
            }

            setCalcData({
                saidaReal: formatDateBR(sObj),
                inicioOficial: formatDateBR(userDate),
                termino: formatDateBR(tObj),
                retorno: formatDateBR(rObj),
                proximaDisponivel: proxima,
                erroFolga: isFolga,
                erroGeral: check.msg
            });
        }
    }, [startDate, duration, venderDezDias, schedules]);

    const handleUpdate = () => {
        if (calcData.erroGeral || calcData.erroFolga || !calcData.termino) return;

        onUpdate({
            ...scheduleToEdit,
            startDate: calcData.inicioOficial,
            data_inicio: calcData.inicioOficial,
            endDate: calcData.termino,
            data_fim: calcData.termino,
            durationDays: parseInt(duration, 10),
            duration_days: parseInt(duration, 10),
            abonoPecuniario: venderDezDias,
            diasVendidos: venderDezDias ? 10 : 0
        });
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Editar Férias: {selectedEmp?.nome || scheduleToEdit.employeeName || scheduleToEdit.employee_name}</Text>
            </View>

            <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
                <View style={styles.vendaRow}>
                    <View style={{flex: 1}}>
                        <Text style={styles.vendaTitle}>Venda de Férias (Abono)</Text>
                        <Text style={styles.vendaSub}>Vender 10 dias do saldo anual</Text>
                    </View>
                    <Switch value={venderDezDias} onValueChange={setVenderDezDias} trackColor={{ false: "#ddd", true: COLORS.PRIMARY }} />
                </View>

                <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Início das Férias</Text>
                        <TextInput 
                            style={[styles.input, (calcData.erroFolga || calcData.erroGeral) && {borderColor: COLORS.ERROR, borderWidth: 2}]} 
                            placeholder="DD/MM/AAAA" 
                            keyboardType="numeric" 
                            maxLength={10} 
                            value={startDate}
                            onChangeText={handleDateChange}
                        />
                    </View>
                    <View style={{ width: 15 }} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Dias de Gozo</Text>
                        <TextInput 
                            style={styles.input} 
                            placeholder="Qtd" 
                            keyboardType="numeric" 
                            value={duration} 
                            onChangeText={setDuration} 
                        />
                    </View>
                </View>

                {calcData.erroGeral ? (
                    <View style={styles.errorCard}>
                        <Text style={styles.errorText}>⚠️ {calcData.erroGeral}</Text>
                    </View>
                ) : null}

                {calcData.erroFolga && (
                    <View style={styles.errorCard}>
                        <Text style={styles.errorText}>❌ Início em FOLGA não permitido.</Text>
                        <TouchableOpacity onPress={() => setStartDate(calcData.proximaDisponivel)}>
                            <Text style={styles.suggestionText}>Sugestão: {calcData.proximaDisponivel} (Aplicar)</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {calcData.termino && !calcData.erroFolga && !calcData.erroGeral ? (
                    <View style={{ marginTop: 20 }}>
                        <View style={[styles.card, {backgroundColor: '#e3f2fd'}]}>
                            <Text style={styles.cardLab}>SAÍDA ANTECIPADA (FOLGA)</Text>
                            <Text style={[styles.cardVal, {color: COLORS.PRIMARY}]}>{calcData.saidaReal}</Text>
                        </View>
                        <View style={styles.row}>
                            <View style={[styles.card, {flex: 1}]}>
                                <Text style={styles.cardLab}>INÍCIO OFICIAL</Text>
                                <Text style={styles.cardVal}>{calcData.inicioOficial}</Text>
                            </View>
                            <View style={{width: 10}}/>
                            <View style={[styles.card, {flex: 1}]}>
                                <Text style={styles.cardLab}>ÚLTIMO DIA</Text>
                                <Text style={styles.cardVal}>{calcData.termino}</Text>
                            </View>
                        </View>
                        <View style={[styles.card, {backgroundColor: '#e8f5e9'}]}>
                            <Text style={styles.cardLab}>RETORNO AO TRABALHO (1ª ESCALA)</Text>
                            <Text style={[styles.cardVal, {color: COLORS.SUCCESS}]}>{calcData.retorno}</Text>
                        </View>
                    </View>
                ) : null}

                <View style={styles.actions}>
                    <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.CANCEL }]} onPress={onCancel}>
                        <Text style={styles.btnT}>CANCELAR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[
                            styles.btn, 
                            { 
                                backgroundColor: COLORS.SAVE, 
                                opacity: (calcData.termino && !calcData.erroFolga && !calcData.erroGeral) ? 1 : 0.5 
                            }
                        ]} 
                        onPress={handleUpdate} 
                        disabled={!calcData.termino || calcData.erroFolga || !!calcData.erroGeral}
                    >
                        <Text style={styles.btnT}>SALVAR ALTERAÇÕES</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.BG },
    header: { padding: 20, backgroundColor: COLORS.HEADER, borderBottomWidth: 1, borderColor: COLORS.LINE, alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: 'bold' },
    form: { padding: 20 },
    label: { fontSize: 13, fontWeight: 'bold', marginTop: 15, marginBottom: 5 },
    vendaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0f4ff', padding: 15, borderRadius: 12, marginTop: 15 },
    vendaTitle: { fontSize: 14, fontWeight: 'bold', color: COLORS.PRIMARY },
    vendaSub: { fontSize: 11, color: COLORS.MUTED },
    input: { backgroundColor: COLORS.INPUT_BG, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.LINE, fontSize: 16 },
    row: { flexDirection: 'row', marginTop: 10 },
    errorCard: { backgroundColor: '#ffebee', padding: 15, borderRadius: 10, marginTop: 15, borderWidth: 1, borderColor: '#ef9a9a' },
    errorText: { color: COLORS.ERROR, fontWeight: 'bold', textAlign: 'center', fontSize: 12 },
    suggestionText: { color: COLORS.PRIMARY, textAlign: 'center', marginTop: 5, fontWeight: 'bold' },
    card: { padding: 15, borderRadius: 12, borderWidth: 1, borderColor: COLORS.LINE, alignItems: 'center', marginVertical: 5, backgroundColor: '#fff' },
    cardLab: { fontSize: 9, fontWeight: 'bold', color: '#666' },
    cardVal: { fontSize: 18, fontWeight: 'bold' },
    actions: { flexDirection: 'row', gap: 10, marginTop: 30, marginBottom: 50 },
    btn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
    btnT: { color: '#fff', fontWeight: 'bold' }
});