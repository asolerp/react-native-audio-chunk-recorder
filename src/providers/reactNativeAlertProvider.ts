/**
 * Default AlertProvider implementation for React Native
 */

import { Alert } from 'react-native';
import type { AlertProvider, AlertButton } from '../types';

export const reactNativeAlertProvider: AlertProvider = {
  showAlert: (title: string, message: string, buttons: AlertButton[]) => {
    // Transform our AlertButton interface to React Native's AlertButton
    const rnButtons = buttons.map(button => ({
      text: button.text,
      onPress: button.onPress,
      style: button.style
    }));

    Alert.alert(title, message, rnButtons, {
      cancelable: false
    });
  }
};
