import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ProfileSettings } from "./profile-settings"

export default function SettingsPage() {
  return (
    <section className="mx-auto w-full max-w-3xl space-y-8">
      <header className="my-2 mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your profile and AI connection.</p>
      </header>

      <div className="grid gap-6">
        <ProfileSettings />
        <Link href="/settings/ai" className="block">
          <Card className="h-full transition-colors hover:bg-accent/30">
            <CardHeader>
              <CardTitle>AI connection</CardTitle>
              <CardDescription>Choose the AI provider for Watch translations and vocabulary explanations.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm font-medium text-primary">Manage AI connection →</CardContent>
          </Card>
        </Link>
      </div>
    </section>
  )
}
