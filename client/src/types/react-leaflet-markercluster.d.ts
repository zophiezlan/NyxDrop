declare module "@changey/react-leaflet-markercluster" {
  import type { ComponentType, ReactNode } from "react";

  interface MarkerClusterGroupProps {
    chunkedLoading?: boolean;
    maxClusterRadius?: number | ((zoom: number) => number);
    disableClusteringAtZoom?: number;
    spiderfyOnMaxZoom?: boolean;
    showCoverageOnHover?: boolean;
    zoomToBoundsOnClick?: boolean;
    children?: ReactNode;
  }

  const MarkerClusterGroup: ComponentType<MarkerClusterGroupProps>;
  export default MarkerClusterGroup;
}
