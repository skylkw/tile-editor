import Editor from "./components/editor"

export default function App() {
  return (
    <div className="flex h-screen w-screen">
      <div className="flex h-full w-64 flex-col items-center gap-4 border-r border-gray-300 p-4">
        <h1 className="text-2xl font-bold">Tile Editor</h1>
        {/* 侧边栏内容 */}
      </div>
      <Editor />
    </div>
  )
}
