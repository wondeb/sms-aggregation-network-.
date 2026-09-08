import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import io from 'socket.io-client';
import { API_URL, WS_URL, ENDPOINTS, CONFIG } from '../config';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        const res = await axios.get(`${API_URL}${ENDPOINTS.BALANCE}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUser({ token });
        setBalance(res.data.balance);
        connectSocket(token);
      }
    } catch (error) {
      console.error('Load user error:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const hardwareId = 'MOBILE_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const response = await axios.post(`${API_URL}${ENDPOINTS.LOGIN}`, {
        email,
        password,
        hardwareId
      });
      
      const { token, balance: initialBalance, userId } = response.data;
      await AsyncStorage.setItem('token', token);
      
      setUser({ token, email, userId });
      setBalance(initialBalance);
      connectSocket(token);
      
      return true;
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Login failed');
    }
  };

  const connectSocket = (token) => {
    try {
      const socketInstance = io(WS_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000
      });
      
      socketInstance.on('connect', () => {
        console.log('Socket connected');
        socketInstance.emit('authenticate', { token });
      });
      
      socketInstance.on('balance_update', (newBalance) => {
        setBalance(parseFloat(newBalance));
      });
      
      socketInstance.on('order_code_received', (data) => {
        console.log('Order code received:', data);
      });
      
      socketInstance.on('disconnect', () => {
        console.log('Socket disconnected');
      });
      
      setSocket(socketInstance);
    } catch (error) {
      console.error('Socket connection error:', error);
    }
  };

  const requestWithdraw = async (amount, method, address) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await axios.post(`${API_URL}${ENDPOINTS.WITHDRAW}`, {
        amount,
        method,
        wallet: address
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return { success: true, data: res.data };
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Withdrawal failed');
    }
  };

  const logout = async () => {
    try {
      if (socket) {
        socket.disconnect();
      }
      await AsyncStorage.removeItem('token');
      setUser(null);
      setBalance(0);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return <div style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e1e1e'}}>
      <div style={{color: '#fff', fontSize: 20}}>Loading...</div>
    </div>;
  }

  return (
    <AuthContext.Provider value={{ user, balance, login, requestWithdraw, logout, socket }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
