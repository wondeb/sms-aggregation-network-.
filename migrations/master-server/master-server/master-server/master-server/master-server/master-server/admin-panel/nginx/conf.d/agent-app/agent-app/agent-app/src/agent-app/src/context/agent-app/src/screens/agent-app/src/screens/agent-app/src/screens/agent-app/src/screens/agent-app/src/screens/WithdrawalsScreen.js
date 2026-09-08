import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_URL, ENDPOINTS } from '../config';

const WithdrawalsScreen = () => {
  const [withdrawals, setWithdrawals] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchWithdrawals();
  }, []);

  const fetchWithdrawals = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await axios.get(`${API_URL}${ENDPOINTS.WITHDRAWALS}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWithdrawals(res.data.withdrawals || []);
    } catch (error) {
      console.error('Fetch withdrawals error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchWithdrawals();
  };

  const getStatusColor = (status) => {
    const colors = {
      'paid': '#2ea043',
      'approved': '#58a6ff',
      'pending_review': '#e3b341',
      'rejected': '#da3633'
    };
    return colors[status] || '#8b949e';
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Withdrawal History</Text>
      </View>
      
      {withdrawals.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>💸 No withdrawals yet</Text>
          <Text style={styles.emptySub}>Request your first withdrawal from the dashboard</Text>
        </View>
      ) : (
        withdrawals.map(w => (
          <View key={w.id} style={styles.withdrawCard}>
            <View style={styles.withdrawHeader}>
              <Text style={styles.withdrawAmount}>${parseFloat(w.amount).toFixed(2)}</Text>
              <Text style={[styles.withdrawStatus, { color: getStatusColor(w.status) }]}>
                {w.status.replace('_', ' ').toUpperCase()}
              </Text>
            </View>
            <Text style={styles.withdrawInfo}>Method: {w.method}</Text>
            <Text style={styles.withdrawInfo}>Wallet: {w.wallet_address || 'N/A'}</Text>
            <Text style={styles.withdrawInfo}>Requested: {new Date(w.requested_at).toLocaleString()}</Text>
            {w.fee_amount > 0 && (
              <Text style={styles.withdrawFee}>Fee: ${parseFloat(w.fee_amount).toFixed(2)}</Text>
            )}
            {w.admin_notes && (
              <Text style={styles.withdrawNotes}>Note: {w.admin_notes}</Text>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e1e' },
  header: { padding: 20, backgroundColor: '#21262d' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 18, color: '#8b949e', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#58a6ff', textAlign: 'center' },
  withdrawCard: {
    backgroundColor: '#161b22',
    margin: 15,
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#238636'
  },
  withdrawHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  withdrawAmount: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  withdrawStatus: { fontSize: 12, fontWeight: 'bold' },
  withdrawInfo: { fontSize: 14, color: '#8b949e', marginBottom: 4 },
  withdrawFee: { fontSize: 13, color: '#e3b341', marginTop: 8 },
  withdrawNotes: { fontSize: 13, color: '#58a6ff', marginTop: 8, fontStyle: 'italic' }
});

export default WithdrawalsScreen;
