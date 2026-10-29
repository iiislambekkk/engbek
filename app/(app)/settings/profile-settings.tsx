"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, User } from "lucide-react"

import { authClient } from "@/lib/auth-client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const MAX_AVATAR_SIZE = 2 * 1024 * 1024

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")
}

export function ProfileSettings() {
  const { data: session } = authClient.useSession()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState("")
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const user = session?.user
  const currentName = name || user?.name || ""
  const currentImage = image ?? user?.image ?? null

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const nextName = name.trim()
    if (!nextName) return setError("Введите имя.")
    if (nextName.length > 80) return setError("Имя должно содержать не более 80 символов.")

    setSaving(true)
    setError("")
    const result = await authClient.updateUser({ name: nextName, ...(image !== null ? { image } : {}) })
    setSaving(false)
    if (result.error) {
      setError(result.error.message ?? "Не удалось сохранить профиль.")
      return
    }
    setName("")
    setImage(null)
    if (fileRef.current) fileRef.current.value = ""
    router.refresh()
  }

  function chooseImage(file?: File) {
    if (!file) return
    setError("")
    if (!file.type.startsWith("image/")) return setError("Выберите файл изображения.")
    if (file.size > MAX_AVATAR_SIZE) return setError("Размер изображения должен быть не больше 2 МБ.")
    const reader = new FileReader()
    reader.onload = () => setImage(typeof reader.result === "string" ? reader.result : null)
    reader.onerror = () => setError("Не удалось прочитать изображение.")
    reader.readAsDataURL(file)
  }

  return <Card className="max-w-xl">
    <CardHeader>
      <CardTitle>Профиль</CardTitle>
      <CardDescription>Измените имя и фотографию, которые видны в приложении.</CardDescription>
    </CardHeader>
    <CardContent>
      <form onSubmit={saveProfile} className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {currentImage && <AvatarImage src={currentImage} alt={currentName} />}
            <AvatarFallback>{initials(currentName) || <User className="size-6" />}</AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(event) => chooseImage(event.target.files?.[0])} />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Camera className="size-4" />
              Выбрать аватар
            </Button>
            <p className="text-xs text-muted-foreground">Изображение до 2 МБ</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-name">Имя</Label>
          <Input id="profile-name" value={currentName} onChange={(event) => setName(event.target.value)} maxLength={80} required />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={saving || !user}>{saving ? "Сохранение…" : "Сохранить профиль"}</Button>
      </form>
    </CardContent>
  </Card>
}
