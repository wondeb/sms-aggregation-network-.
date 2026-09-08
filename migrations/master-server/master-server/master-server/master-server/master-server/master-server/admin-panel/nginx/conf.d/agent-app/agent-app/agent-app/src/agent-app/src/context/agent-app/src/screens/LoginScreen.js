import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, 
  KeyboardAvoidingView, Platform, ScrollView 
} from 'react-native';
import { useAuth } from '../context/AuthContext';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      Alert.alert('Success', 'Logged in successfully!');
      // Navigation handled by AuthProvider state update
    } catch (error) {
      Alert.alert('Login Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>📱</Text>
          <Text style={styles.title}>SMS Network Agent</Text>
          <Text style={styles.subtitle}>Connect. Earn. Grow.</Text>
        </View>

        <View style={styles.formContainer}>
          <TextInput
            style={styles.input}
            placeholder="Email Address"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
          />
          
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />

          <TouchableOpacity 
            style={[styles.button, loading && styles.buttonDisabled]} 
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Logging in...' : 'Login'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.link}
            onPress={() => Alert.alert('Demo Account', 'Use: agent@example.com / password123')}
            disabled={loading}
          >
            <Text style={styles.linkText}>Demo Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e1e1e' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  logoContainer: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 60, marginBottom: 20 },
  title: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    color: '#fff', 
    marginBottom: 10 
  },
  subtitle: { 
    fontSize: 16, 
    color: '#8b949e',
    fontStyle: 'italic'
  },
  formContainer: { width: '100%' },
  input: { 
    backgroundColor: '#30363d', 
    padding: 16, 
    borderRadius: 12, 
    marginBottom: 16, 
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#484f58'
  },
  button: { 
    backgroundColor: '#238636', 
    padding: 16, 
    borderRadius: 12, 
    alignItems: 'center',
    marginTop: 10
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: { 
    color: '#fff', 
    fontWeight: 'bold', 
    fontSize: 18 
  },
  link: {
    alignItems: 'center',
    marginTop: 15
  },
  linkText: {
    color: '#58a6ff',
    fontSize: 14
  }
});

export default LoginScreen;
