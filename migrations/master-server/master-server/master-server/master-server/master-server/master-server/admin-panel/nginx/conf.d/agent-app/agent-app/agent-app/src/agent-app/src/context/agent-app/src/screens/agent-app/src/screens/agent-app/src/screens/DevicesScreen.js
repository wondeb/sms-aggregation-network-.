// agent-app/src/screens/DevicesScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_URL, ENDPOINTS } from '../config';
import { useAuth } from '../context/AuthContext';

const DevicesScreen = () => {
  const { user } = useAuth();
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await axios.get(`${API_URL}${ENDPOINTS.DEVICES}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDevices(res.data.devices);
    } catch (error) {
      console.error('Fetch devices error:', error);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Devices</Text>
      </View>
      
      {devices.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No devices registered yet</Text>
          <Text style={styles.emptySub}>Add devices to start earning</Text>
        </View>
      ) : (
        devices.map(device => (
          <View key={device.id} style={styles.deviceCard}>
            <Text style={styles.deviceName}>{device.device_name || 'Unnamed Device'}</Text>
            <Text style={styles.deviceInfo}>Ports: {device.active_ports}/{device.total_ports}</Text>
            <Text style={styles.deviceInfo}>Status: {device.is_online ? '🟢 Online' : '🔴 Offline'}</Text>
            <Text style={styles.deviceInfo}>Last heartbeat: {new Date(device.last_heartbeat).toLocaleString()}</Text>
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
  deviceCard: {
    backgroundColor: '#161b22',
    margin: 15,
    padding: 15,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#0969da
     },
  deviceName: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  deviceInfo: { fontSize: 14, color: '#8b949e', marginBottom: 4 }
});

export default DevicesScreen;  
