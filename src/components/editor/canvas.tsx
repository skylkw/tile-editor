import { useLeaferEngine } from "@/hooks/use-leafer-engine"

export default function Canvas() {
  const { viewRef,setTile } = useLeaferEngine()

  return <div ref={viewRef} className="h-full w-full" />
}
