import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, RefreshControl 
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { ENDPOINTS, CONFIG } from '../config';
import axios from 'axios';

const DashboardScreen = ({ navigation }) => {
  const { user, balance, logout, socket } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [totalEarned, setTotalEarned] = useState(0);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await axios.get(`${API_URL}${ENDPOINTS.BALANCE}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTotalEarned(res.data.total_earned || 0);
      
      const withdrawRes = await axios.get(`${API_URL}${ENDPOINTS.WITHDRAWALS}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const pending = withdrawRes.data.withdrawals.filter(w => w.status === 'pending_review').length;
      setPendingWithdrawals(pending);
    } catch (error) {
      console.error('Fetch data error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const handleWithdraw = async () => {
    const amount = prompt(`Amount (Min $${CONFIG.MIN_WITHDRAWAL}):`);
    if (!amount || parseFloat(amount) < CONFIG.MIN_WITHDRAWAL) {
      Alert.alert('Invalid Amount', `Minimum withdrawal is $${CONFIG.MIN_WITHDRAWAL}`);
      return;
    }

    const method = prompt("Method (paypal/bank/crypto):");
    if (!method) return;

    const address = prompt("Payment Address/Account:");
    if (!address) return;

    try {
      const res = await requestWithdraw(parseFloat(amount), method, address);
      if (res.success) {
        Alert.alert('Success', 'Withdrawal request submitted!');
        fetchDashboardData();
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const requestWithdraw = async (amount, method, address) => {
    const token = await AsyncStorage.getItem('token');
    const res = await axios.post(`${API_URL}${ENDPOINTS.WITHDRAW}`, {
      amount,
      method,
      wallet: address
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data;
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout }
    ]);
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Welcome back!</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>🚪</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        <Text style={styles.balanceAmount}>${balance.toFixed(2)}</Text>
        <Text style={styles.balanceSub}>Total Earned: ${totalEarned.toFixed(2)}</Text>
      </View>

      {pendingWithdrawals > 0 && (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingText}>
            ⏳ {pendingWithdrawals} pending withdrawal{pendingWithdrawals > 1 ? 's' : ''}
          </Text>
        </View>
      )}

      <View style={styles.actionButtons}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.primaryButton]}
          onPress={handleWithdraw}
        >
          <Text style={styles.actionText}>💰 Withdraw Funds</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={() => navigation.navigate('Referral')}
        >
          <Text style={styles.actionText}>👥 Referral Program</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, styles.tertiaryButton]}
          onPress={() => navigation.navigate('Devices')}
        >
          <Text style={styles.actionText}>📱 Manage Devices</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, styles.quaternaryButton]}
          onPress={() => navigation.navigate('Orders')}
        >
          <Text style={styles.actionText}>📦 Order History</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, styles.quinaryButton]}
          onPress={() => navigation.navigate('Withdrawals')}
        >
          <Text style={styles.actionText}>💳 Withdrawal History</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>💡 Tips</Text>
        <Text style={styles.infoText}>• Keep your devices online for best performance</Text>
        <Text style={styles.infoText}>• Monitor your SIM success rates regularly</Text>
        <Text style={styles.infoText}>• Share referral links to earn 5% commission</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e1e' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20,
    backgroundColor: '#21262d',
    marginBottom: 10
  },
  welcome: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  email: { fontSize: 14, color: '#8b949e', marginTop: 5 },
  logoutBtn: { padding: 10 },
  logoutText: { fontSize: 24 },
  balanceCard: { 
    backgroundColor: '#161b22', 
    padding: 25, 
    borderRadius: 12, 
    margin: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#238636'
  },
  balanceLabel: { fontSize: 14, color: '#8b949e', marginBottom: 8 },
  balanceAmount: { color: '#2ea043', fontSize: 42, fontWeight: 'bold' },
  balanceSub: { color: '#8b949e', marginTop: 8, fontSize: 14 },
  pendingCard: {
    backgroundColor: '#e3b341',
    padding: 12,
    marginHorizontal: 15,
    borderRadius: 8,
    alignItems: 'center'
  },
  pendingText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  actionButtons: { padding: 15 },
  actionButton: { 
    padding: 18, 
    marginVertical: 8, 
    borderRadius: 10, 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  },
  primaryButton: { backgroundColor: '#238636' },
  secondaryButton: { backgroundColor: '#0969da' },
  tertiaryButton: { backgroundColor: '#1f6feb' },
  quaternaryButton: { backgroundColor: '#388bfd' },
  quinaryButton: { backgroundColor: '#58a6ff' },
  actionText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  infoCard: {
    backgroundColor: '#161b22',
    margin: 15,
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#58a6ff'
  },
  infoTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
  infoText: { color: '#8b949e', marginBottom: 6, fontSize: 13 }
});

export default DashboardScreen;
