import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

import { HomeScreen } from '../screens/HomeScreen';
import { MedicinesScreen } from '../screens/MedicinesScreen';
import { AddMedicineScreen } from '../screens/AddMedicineScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { CaregiverScreen } from '../screens/CaregiverScreen';
import { DebugScreen } from '../screens/DebugScreen';

import { RootTabParamList, MedicinesStackParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<MedicinesStackParamList>();

function MedicinesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MedicinesList" component={MedicinesScreen} />
      <Stack.Screen name="AddMedicine" component={AddMedicineScreen} />
      <Stack.Screen name="EditMedicine" component={AddMedicineScreen} />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'home';
            if (route.name === 'Home') iconName = 'home';
            else if (route.name === 'Medicines') iconName = 'medical';
            else if (route.name === 'History') iconName = 'time';
            else if (route.name === 'Caregiver') iconName = 'people';
            else if (route.name === 'Debug') iconName = 'bug';
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.paused,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingTop: 4,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Medicines" component={MedicinesStack} />
        <Tab.Screen name="History" component={HistoryScreen} />
        <Tab.Screen name="Caregiver" component={CaregiverScreen} />
        <Tab.Screen name="Debug" component={DebugScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
