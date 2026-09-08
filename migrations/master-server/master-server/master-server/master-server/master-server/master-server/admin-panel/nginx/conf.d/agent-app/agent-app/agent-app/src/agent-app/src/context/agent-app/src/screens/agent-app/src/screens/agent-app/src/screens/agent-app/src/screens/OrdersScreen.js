import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_URL, ENDPOINTS } from '../config';

const OrdersScreen = () => {
  const [orders, setOrders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrders(res.data.orders || []);
    } catch (error) {
      console.error('Fetch orders error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const getStatusColor = (status) => {
    const colors = {
      'completed': '#2ea043',
      'processing': '#e3b341',
      'pending': '#58a6ff',
      'failed': '#da3633'
    };
    return colors[status] || '#8b949e';
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Order History</Text>
      </View>
      
      {orders.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>📭 No orders yet</Text>
          <Text style={styles.emptySub}>Orders will appear here</Text>
        </View>
      ) : (
        orders.map(order => (
          <View key={order.id} style={styles.orderCard}>
            <View style={styles.orderHeader}>
              <Text style={styles.orderService}>{order.service}</Text>
              <Text style={[styles.orderStatus, { color: getStatusColor(order.status) }]}>
                {order.status.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.orderInfo}>Country: {order.country}</Text>
            <Text style={styles.orderInfo}>Amount: ${parseFloat(order.gross_payout || 0).toFixed(2)}</Text>
            <Text style={styles.orderInfo}>Date: {new Date(order.created_at).toLocaleString()}</Text>
            {order.activation_code && (
              <Text style={styles.orderCode}>Code: {order.activation_code}</Text>
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
  emptySub: { fontSize: 14, color: '#58a6ff' },
  orderCard: {
    backgroundColor: '#161b22',
    margin: 15,
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#58a6ff'
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  orderService: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  orderStatus: { fontSize: 12, fontWeight: 'bold' },
  orderInfo: { fontSize: 14, color: '#8b949e', marginBottom: 4 },
  orderCode: { fontSize: 13, color: '#2ea043', marginTop: 8, fontFamily: 'monospace' }
});

export default OrdersScreen;
