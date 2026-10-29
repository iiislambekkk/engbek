"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import Image from "next/image"
import { BookOpenText, Heart, ImagePlus, LoaderCircle, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

type Document = { id: string; title: string; format: string; originalFileName: string|null; fileSizeBytes: number|null; progress: number|null; updatedAt: string; _count: { blocks: number }; author?: string|null; coverUrl?: string|null; isFavorite: boolean; listIds: string[]; hasCustomCover: boolean }
type BookList = { id: string; name: string; _count: { books: number } }
const readableSize = (bytes: number|null) => bytes == null ? "" : bytes < 1024*1024 ? `${Math.ceil(bytes/1024)} KB` : `${(bytes/1024/1024).toFixed(1)} MB`
const safeProgress = (value: number|null|undefined) => Number.isFinite(value) ? Math.round(Math.max(0,Math.min(1,value||0))*100) : 0

async function cropCover(file: File, zoom: number, focusX: number, focusY: number) {
  const image = document.createElement("img")
  const source = URL.createObjectURL(file)
  try {
    image.src = source
    await image.decode()
    const baseWidth = Math.min(image.naturalWidth, image.naturalHeight * 2 / 3)
    const width = baseWidth / zoom, height = width * 3 / 2
    const sx = Math.max(0, Math.min(image.naturalWidth - width, (image.naturalWidth - width) * focusX))
    const sy = Math.max(0, Math.min(image.naturalHeight - height, (image.naturalHeight - height) * focusY))
    const canvas = document.createElement("canvas")
    canvas.width = 600; canvas.height = 900
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Could not crop this image.")
    context.drawImage(image, sx, sy, width, height, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not crop this image.")), "image/jpeg", 0.92))
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-cover.jpg`, { type: "image/jpeg" })
  } finally { URL.revokeObjectURL(source) }
}

export function ReadLibrary({ initialDocuments, initialLists }: { initialDocuments: Document[]; initialLists: BookList[] }) {
  const [documents, setDocuments] = useState(initialDocuments), [busy, setBusy] = useState(false), [message, setMessage] = useState("")
  const [lists, setLists] = useState(initialLists)
  const [filter, setFilter] = useState("all")
  const input = useRef<HTMLInputElement>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<Document | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [coverFileName, setCoverFileName] = useState("")
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [resetCoverToOriginal, setResetCoverToOriginal] = useState(false)
  const [cropZoom, setCropZoom] = useState(1)
  const [cropX, setCropX] = useState(0.5)
  const [cropY, setCropY] = useState(0.5)
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const [newListOpen, setNewListOpen] = useState(false)
  const [editingList, setEditingList] = useState<BookList | null>(null)
  const [deletingList, setDeletingList] = useState<BookList | null>(null)
  const [listBusy, setListBusy] = useState(false)
  const [listName, setListName] = useState("")
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview) }, [coverPreview])
  async function upload(file?: File) {
    if (!file) return
    setBusy(true); setMessage("")
    const form = new FormData(); form.set("file", file)
    try {
      const response = await fetch("/api/read", { method: "POST", body: form }), body = await response.json()
      if (!response.ok) throw new Error(body.error || "Upload failed.")
      setDocuments(current => [{...body.document,progress:0,isFavorite:false,listIds:[],_count:{blocks:0}}, ...current]); setMessage("Added to your library.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed.") }
    finally { setBusy(false); if (input.current) input.current.value = "" }
  }
  async function remove(id: string) {
    const response = await fetch(`/api/read?id=${encodeURIComponent(id)}`, { method: "DELETE" }), body = await response.json()
    if (!response.ok) { setMessage(body.error || "Could not delete document."); return false }
    setDocuments(current => current.filter(document => document.id !== id))
    setDeleteTarget(null)
    setMessage("Book deleted.")
    return true
  }
  async function updateBook(id: string, patch: { favorite?: boolean; listIds?: string[] }) {
    const previous = documents.find(document => document.id === id)
    if (!previous) return
    const next = { ...previous, ...(patch.favorite !== undefined ? { isFavorite: patch.favorite } : {}), ...(patch.listIds !== undefined ? { listIds: patch.listIds } : {}) }
    setDocuments(current => current.map(document => document.id === id ? next : document))
    try {
      const response = await fetch(`/api/read/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch.favorite !== undefined ? { favorite: patch.favorite } : { listIds: patch.listIds }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not update book.")
    } catch (error) {
      setDocuments(current => current.map(document => document.id === id ? previous : document))
      setMessage(error instanceof Error ? error.message : "Could not update book.")
    }
  }
  async function createList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = listName.trim()
    if (!name) return
    setListBusy(true)
    try {
      const response = await fetch(editingList ? `/api/read/lists/${editingList.id}` : "/api/read/lists", { method: editingList ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not create list.")
      setLists(current => (editingList ? current.map(list=>list.id===editingList.id?{...list,...body.list}:list) : [...current, body.list]).sort((left, right) => left.name.localeCompare(right.name)))
      setListName(""); setNewListOpen(false); setEditingList(null); setMessage(editingList ? "Book list renamed." : "Book list created.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create list.") }
    finally { setListBusy(false) }
  }
  async function deleteList(list: BookList) {
    const response = await fetch(`/api/read/lists/${list.id}`, { method: "DELETE" })
    const body = await response.json()
    if (!response.ok) { setMessage(body.error || "Could not delete list."); return }
    setLists(current => current.filter(item=>item.id!==list.id))
    setDocuments(current=>current.map(book=>({...book,listIds:book.listIds.filter(id=>id!==list.id)})))
    if (filter === list.id) setFilter("all")
    setDeletingList(null)
    setMessage(`“${list.name}” deleted. Books remain in your library.`)
  }
  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    const form = new FormData(event.currentTarget)
    const cover = coverInput.current?.files?.[0]
    setEditBusy(true)
    try {
      if (cover) form.set("cover", await cropCover(cover, cropZoom, cropX, cropY))
      if (resetCoverToOriginal) form.set("resetCover", "true")
      const response = await fetch(`/api/read/${editing.id}`, { method: "PATCH", body: form })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not update book.")
      setDocuments(current => current.map(document => document.id === editing.id ? { ...document, ...body.document } : document))
      setEditing(null)
      setCoverFileName("")
      setCoverPreview(null)
      setResetCoverToOriginal(false)
      setMessage("Book details updated.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update book.")
    } finally {
      setEditBusy(false)
      if (coverInput.current) coverInput.current.value = ""
    }
  }
  const visibleDocuments = documents.filter(document => filter === "all" || (filter === "favorites" ? document.isFavorite : document.listIds.includes(filter)))
  return <section className="mx-auto w-full max-w-5xl space-y-6 py-6 sm:py-10">
    <header className="flex flex-col items-start gap-4"><div className="w-full space-y-2"><p className="text-sm font-medium text-muted-foreground">Read</p><h1 className="text-3xl font-semibold tracking-tight">Your library</h1><p className="text-muted-foreground">Your books, ready when you are.</p></div>
      <div className="w-full"><input ref={input} type="file" accept=".epub,application/epub+zip" className="sr-only" onChange={event => void upload(event.target.files?.[0])}/><Button className="w-full" onClick={() => input.current?.click()} disabled={busy}>{busy?<LoaderCircle className="animate-spin"/>:<Plus/>}{busy?"Processing…":"Add an EPUB"}</Button></div></header>
    <div className="flex min-w-0 items-center gap-2 border-b pb-3">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain whitespace-nowrap pb-1 [scrollbar-width:none]">
      <Button variant={filter === "all" ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("all")}>All books <span className="ml-1 text-muted-foreground">{documents.length}</span></Button>
      <Button variant={filter === "favorites" ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("favorites")}><Heart className="mr-1 size-4"/>Favorites</Button>
      {lists.map(list => <div key={list.id} className="flex shrink-0 items-center"><Button variant={filter === list.id ? "secondary" : "ghost"} size="sm" className="max-w-36 shrink-0" onClick={() => setFilter(list.id)}><span className="max-w-24 truncate">{list.name}</span><span className="ml-1 shrink-0 text-muted-foreground">{documents.filter(book => book.listIds.includes(list.id)).length}</span></Button><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Manage ${list.name}`} className="size-7"/>}><MoreHorizontal className="size-4"/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={()=>{setEditingList(list);setListName(list.name);setNewListOpen(true)}}><Pencil className="size-4"/>Rename list</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={()=>setDeletingList(list)}><Trash2 className="size-4"/>Delete list</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>)}
      </div>
      <Button variant="ghost" size="sm" aria-label="Create a book list" className="ml-auto shrink-0 px-2 sm:px-3" onClick={() => {setEditingList(null);setListName("");setNewListOpen(true)}}><Plus className="size-4 sm:mr-1"/><span className="hidden sm:inline">New list</span></Button>
    </div>
    <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{message}</p>
    {visibleDocuments.length ? <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-5 lg:gap-x-8">{visibleDocuments.map(book=>{const progress=safeProgress(book.progress);return <article key={book.id} className="group w-full min-w-0 overflow-hidden"><div className="relative mb-3 block aspect-[2/3] w-full overflow-hidden rounded-sm bg-muted shadow-sm"><Link href={`/read/${book.id}`} aria-label={`Open ${book.title}`} className="absolute inset-0">{book.coverUrl?<Image src={book.coverUrl} alt={`Cover of ${book.title}`} fill sizes="144px" unoptimized className="object-contain object-center transition-transform duration-300"/>:<div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 via-background/20 to-secondary/40 p-6 text-center"><BookOpenText className="mb-5 size-10 text-primary/70"/><span className="line-clamp-5 max-w-56 text-lg font-semibold leading-6">{book.title}</span></div>}</Link>{book.isFavorite&&<Heart className="absolute left-2 top-2 size-4 fill-rose-500 text-rose-500 drop-shadow"/>}<DropdownMenu><DropdownMenuTrigger render={<Button variant="secondary" size="icon" aria-label={`More actions for ${book.title}`} className="absolute right-1.5 top-1.5 size-7 shadow-sm"/>}><MoreHorizontal className="size-4"/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuLabel>{book.title}</DropdownMenuLabel></DropdownMenuGroup><DropdownMenuCheckboxItem checked={book.isFavorite} onCheckedChange={checked=>void updateBook(book.id,{favorite:checked===true})}><Heart className="size-4"/>{book.isFavorite?"Remove from favorites":"Add to favorites"}</DropdownMenuCheckboxItem><DropdownMenuSub><DropdownMenuSubTrigger><BookOpenText className="size-4"/>Add to list</DropdownMenuSubTrigger><DropdownMenuSubContent>{lists.length?lists.map(list=><DropdownMenuCheckboxItem key={list.id} checked={book.listIds.includes(list.id)} onCheckedChange={checked=>void updateBook(book.id,{listIds:checked===true?[...book.listIds,list.id]:book.listIds.filter(id=>id!==list.id)})}>{list.name}</DropdownMenuCheckboxItem>):<DropdownMenuItem disabled>No lists yet</DropdownMenuItem>}<DropdownMenuSeparator/><DropdownMenuItem onClick={()=>{setEditingList(null);setListName("");setNewListOpen(true)}}><Plus className="size-4"/>Create a list</DropdownMenuItem></DropdownMenuSubContent></DropdownMenuSub><DropdownMenuSeparator/><DropdownMenuItem onClick={()=>{setEditing(book);setCoverFileName("");setCoverPreview(null);setResetCoverToOriginal(false);setCropZoom(1);setCropX(.5);setCropY(.5)}}><Pencil className="size-4"/>Edit book</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={()=>setDeleteTarget(book)}><Trash2 className="size-4"/>Delete book</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div><Link href={`/read/${book.id}`} className="block w-full"><h2 className="line-clamp-2 min-h-10 font-semibold leading-5">{book.title}</h2><p className="mt-1 truncate text-sm text-muted-foreground">{book.author||"Unknown author"}</p><p className="mt-2 text-xs text-muted-foreground">EPUB · {readableSize(book.fileSizeBytes)}</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{width:`${progress}%`}}/></div><p className="mt-1 text-xs text-muted-foreground">{progress}% read</p></Link></article>})}</div> : <div className="py-16 text-center"><BookOpenText className="mx-auto mb-4 size-9 text-muted-foreground"/><h2 className="font-medium">{documents.length ? "No books in this view" : "Your reading list is empty"}</h2><p className="mt-1 text-sm text-muted-foreground">{documents.length ? filter === "favorites" ? "Mark any book as a favorite from its menu." : "Add a book here from its menu, or choose another list." : "Add an EPUB to start reading."}</p></div>}
    <Dialog open={!!editing} onOpenChange={open => { if (!open && !editBusy) { setEditing(null); setCoverFileName(""); setCoverPreview(null); setResetCoverToOriginal(false); if (coverInput.current) coverInput.current.value = "" } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto"><form onSubmit={saveDetails}><DialogHeader><DialogTitle>Edit book</DialogTitle><DialogDescription>Update the title and adjust its cover to the book’s 2:3 portrait shape.</DialogDescription></DialogHeader>
        <div key={editing?.id} className="space-y-4 py-5"><label className="block space-y-2 text-sm font-medium">Title<Input name="title" defaultValue={editing?.title ?? ""} maxLength={300} required /></label>
          <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={event=>{const file=event.currentTarget.files?.[0];setCoverFileName(file?.name??"");setCoverPreview(file?URL.createObjectURL(file):null);setResetCoverToOriginal(false);setCropZoom(1);setCropX(.5);setCropY(.5)}}/>
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={()=>coverInput.current?.click()}><ImagePlus/>Choose cover</Button>{editing?.hasCustomCover&&<Button type="button" variant={resetCoverToOriginal?"secondary":"outline"} onClick={()=>{setResetCoverToOriginal(value=>!value);setCoverPreview(null);setCoverFileName("");if(coverInput.current)coverInput.current.value=""}}>{resetCoverToOriginal?"Keep custom cover":"Reset to EPUB cover"}</Button>}</div>
          {coverPreview&&!resetCoverToOriginal&&<div className="space-y-3 rounded-xl border p-4"><div className="relative mx-auto aspect-[2/3] w-40 overflow-hidden rounded-md bg-muted"><Image src={coverPreview} alt="Cover crop preview" fill sizes="160px" unoptimized className="object-cover transition-transform" style={{objectPosition:`${cropX*100}% ${cropY*100}%`,transform:`scale(${cropZoom})`}}/></div><p className="text-center text-xs text-muted-foreground">Adjust framing · 2:3</p><label className="block space-y-1 text-xs">Zoom<input aria-label="Cover zoom" type="range" min="1" max="3" step="0.05" value={cropZoom} onChange={event=>setCropZoom(Number(event.target.value))} className="w-full"/></label><div className="grid grid-cols-2 gap-3"><label className="block space-y-1 text-xs">Horizontal<input aria-label="Horizontal crop position" type="range" min="0" max="1" step="0.01" value={cropX} onChange={event=>setCropX(Number(event.target.value))} className="w-full"/></label><label className="block space-y-1 text-xs">Vertical<input aria-label="Vertical crop position" type="range" min="0" max="1" step="0.01" value={cropY} onChange={event=>setCropY(Number(event.target.value))} className="w-full"/></label></div></div>}
          {coverFileName&&!coverPreview&&<p className="text-xs text-muted-foreground">{coverFileName}</p>}{resetCoverToOriginal&&<p className="text-xs text-muted-foreground">The original EPUB cover will be restored.</p>}
        </div><DialogFooter><Button type="button" variant="outline" disabled={editBusy} onClick={()=>setEditing(null)}>Cancel</Button><Button type="submit" disabled={editBusy}>{editBusy&&<LoaderCircle className="animate-spin"/>}Save changes</Button></DialogFooter>
      </form></DialogContent>
    </Dialog>
    <Dialog open={newListOpen} onOpenChange={open=>{if(!listBusy){setNewListOpen(open);if(!open)setEditingList(null)}}}><DialogContent><form onSubmit={createList}><DialogHeader><DialogTitle>{editingList?"Rename book list":"Create a book list"}</DialogTitle><DialogDescription>{editingList?"Update the name of this collection.":"Make a collection for your reading plans."}</DialogDescription></DialogHeader><Input autoFocus value={listName} onChange={event=>setListName(event.target.value)} maxLength={80} placeholder="e.g. Short stories" className="my-5"/><DialogFooter><Button type="button" variant="outline" onClick={()=>{setNewListOpen(false);setEditingList(null)}}>Cancel</Button><Button type="submit" disabled={listBusy||!listName.trim()}>{listBusy&&<LoaderCircle className="animate-spin"/>}{editingList?"Save changes":"Create list"}</Button></DialogFooter></form></DialogContent></Dialog>
    <AlertDialog open={!!deletingList} onOpenChange={open=>{if(!open)setDeletingList(null)}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete “{deletingList?.name}”?</AlertDialogTitle><AlertDialogDescription>Books will stay in your library. They will just be removed from this list.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={()=>{if(deletingList)void deleteList(deletingList)}}>Delete list</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={!!deleteTarget} onOpenChange={open=>{if(!open)setDeleteTarget(null)}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete “{deleteTarget?.title}”?</AlertDialogTitle><AlertDialogDescription>This removes the book and its saved reading progress. This action can’t be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={()=>{if(deleteTarget)void remove(deleteTarget.id)}}>Delete book</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>
}
