import { open } from "@tauri-apps/plugin-dialog"
import { useCallback, useState } from "react"
import Editor from "./components/editor"
import { Button } from "./components/ui/button"

import { convertFileSrc } from "@tauri-apps/api/core"

export default function App() {
  const [imagePath, setImagePath] = useState("")
  const [imagePreviewUrl, setImagePreviewUrl] = useState("")

  const handleLoadImage = useCallback(async () => {
    const file = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Image",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"],
        },
      ],
    })

    if (!file || Array.isArray(file)) return

    setImagePath(file)
    setImagePreviewUrl(convertFileSrc(file))
  }, [])

  return (
    <div className="flex h-screen w-screen">
      <div className="flex h-full w-64 flex-col gap-4 border-r border-gray-300 p-4">
        <h1 className="text-2xl font-bold">Tile Editor</h1>
        <Button onClick={handleLoadImage}>加载图片</Button>

        {imagePath ? (
          <div className="space-y-2">
            <p className="truncate text-xs text-gray-500" title={imagePath}>
              {imagePath}
            </p>
            <img
              src={imagePreviewUrl}
              alt="已加载图片"
              className="max-h-48 w-full rounded-md border border-gray-300 object-contain"
            />
          </div>
        ) : null}
      </div>
      <Editor />
    </div>
  )
}
