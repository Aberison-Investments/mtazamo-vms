import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import loadingUrl from "../../assets/loading.lottie?url";

// CSS filter that maps the animation's colours to the brand primary (#599BAE).
// Approach: flatten everything to black first, then shift hue/saturation to target.
const BRAND_FILTER =
  "brightness(0) saturate(100%) invert(62%) sepia(20%) saturate(660%) hue-rotate(157deg) brightness(96%)";

interface Props {
  size?: number;
}

export function LoadingAnimation({ size = 20 }: Props) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0, filter: BRAND_FILTER }}>
      <DotLottieReact src={loadingUrl} autoplay loop style={{ width: size, height: size }} />
    </div>
  );
}
