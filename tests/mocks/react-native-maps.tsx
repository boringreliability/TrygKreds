/**
 * Mock for react-native-maps module
 */

import React from 'react';
import { View, Text } from 'react-native';

interface MapViewProps {
  testID?: string;
  children?: React.ReactNode;
  region?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  onRegionChangeComplete?: (region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }) => void;
}

interface MarkerProps {
  testID?: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  title?: string;
  description?: string;
  children?: React.ReactNode;
}

const MapView: React.FC<MapViewProps> = ({ testID, children }) => (
  <View testID={testID || 'map-view'}>{children}</View>
);

const Marker: React.FC<MarkerProps> = ({ testID, coordinate, title }) => (
  <View testID={testID || `marker-${coordinate.latitude}`}>
    <Text>{title}</Text>
  </View>
);

// Define Region type since we're mocking the module
export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(MapView as any).Marker = Marker;

export { Marker };
export default MapView;
