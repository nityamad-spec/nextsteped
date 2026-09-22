import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  ExternalLink,
  FileText,
  IndianRupee,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CompMatrixAdmin from "@/components/admin/CompMatrixAdmin";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useResourceLibrary } from "@/hooks/useCourseResources";
import {
  LOGO_COLORS,
  TIER_LABELS,
  type ResourceCompany,
  type ResourceCompensation,
  type ResourceKind,
  type ResourceTier,
} from "@/lib/courseResources";

type CompanyDraft = {
  name: string;
  tier: ResourceTier;
  pay_range: string;
  roles: string; // comma-separated
  description: string;
  about: string;
  interview_format: string;
  rounds: string; // one round per line
  look_for: string;
  pro_tip: string;
  sources: string;
  focus_areas: string;
  dsa_difficulty: string;
  locations: string;
  apply_url: string;
  logo_color: string;
};

const emptyCompany: CompanyDraft = {
  name: "",
  tier: "mid_tier",
  pay_range: "",
  roles: "",
  description: "",
  about: "",
  interview_format: "",
  rounds: "",
  look_for: "",
  pro_tip: "",
  sources: "",
  focus_areas: "",
  dsa_difficulty: "",
  locations: "",
  apply_url: "",
  logo_color: LOGO_COLORS[0],
};

type CompensationDraft = {
  role_title: string;
  base_range: string;
  bonus_range: string;
  equity_range: string;
  total_range: string;
  notes: string;
};

const emptyCompensation: CompensationDraft = {
  role_title: "",
  base_range: "",
  bonus_range: "",
  equity_range: "",
  total_range: "",
  notes: "",
};

const AdminResources = () => {
  const { companies, compensation, links, files, loading, refetch } = useResourceLibrary();
  const [companyDialog, setCompanyDialog] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [companyDraft, setCompanyDraft] = useState<CompanyDraft>(emptyCompany);
  const [compDialog, setCompDialog] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [compDraft, setCompDraft] = useState<CompensationDraft>(emptyCompensation);
  const [saving, setSaving] = useState(false);
  const [attachFor, setAttachFor] = useState<{ kind: ResourceKind; id: string; label: string } | null>(null);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const linksFor = (id: string) => links.filter((l) => l.resource_id === id);
  const filesFor = (id: string) => files.filter((f) => f.resource_id === id);

  /* ---------------- companies ---------------- */

  const openCompanyDialog = (c?: ResourceCompany) => {
    if (c) {
      setCompanyDialog({ open: true, id: c.id });
      setCompanyDraft({
        name: c.name,
        tier: c.tier,
        pay_range: c.pay_range ?? "",
        roles: c.roles.join(", "),
        description: c.description ?? "",
        about: c.about ?? "",
        interview_format: c.interview_format ?? "",
        rounds: (c.rounds ?? []).join("\n"),
        look_for: c.look_for ?? "",
        pro_tip: c.pro_tip ?? "",
        sources: c.sources ?? "",
        focus_areas: c.focus_areas ?? "",
        dsa_difficulty: c.dsa_difficulty?.toString() ?? "",
        locations: c.locations ?? "",
        apply_url: c.apply_url ?? "",
        logo_color: c.logo_color ?? LOGO_COLORS[0],
      });
    } else {
      setCompanyDialog({ open: true, id: null });
      setCompanyDraft(emptyCompany);
    }
  };

  const saveCompany = async () => {
    if (!companyDraft.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      name: companyDraft.name.trim(),
      tier: companyDraft.tier,
      pay_range: companyDraft.pay_range.trim() || null,
      roles: companyDraft.roles.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
      description: companyDraft.description.trim() || null,
      about: companyDraft.about.trim() || null,
      interview_format: companyDraft.interview_format.trim() || null,
      rounds: companyDraft.rounds.split("\n").map((s) => s.trim()).filter(Boolean),
      look_for: companyDraft.look_for.trim() || null,
      pro_tip: companyDraft.pro_tip.trim() || null,
      sources: companyDraft.sources.trim() || null,
      focus_areas: companyDraft.focus_areas.trim() || null,
      dsa_difficulty: companyDraft.dsa_difficulty.trim() === "" ? null : Number(companyDraft.dsa_difficulty),
      locations: companyDraft.locations.trim() || null,
      apply_url: companyDraft.apply_url.trim() || null,
      logo_color: companyDraft.logo_color,
    };
    if (payload.dsa_difficulty !== null && (!Number.isFinite(payload.dsa_difficulty) || payload.dsa_difficulty < 0 || payload.dsa_difficulty > 4)) {
      setSaving(false);
      toast({ title: "DSA difficulty must be between 0 and 4", variant: "destructive" });
      return;
    }
    const { error } = companyDialog.id
      ? await supabase.from("resource_companies").update(payload).eq("id", companyDialog.id)
      : await supabase
          .from("resource_companies")
          .insert({ ...payload, position: companies.length });
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setCompanyDialog({ open: false, id: null });
    toast({ title: companyDialog.id ? "Company updated" : "Company added" });
    void refetch();
  };

  const deleteCompany = async (c: ResourceCompany) => {
    if (!window.confirm(`Delete ${c.name}? Professors who picked it lose it too.`)) return;
    await supabase.from("course_resource_picks").delete().eq("resource_type", "company").eq("resource_id", c.id);
    await supabase.from("resource_links").delete().eq("resource_id", c.id);
    await supabase.from("resource_files").delete().eq("resource_id", c.id);
    const { error } = await supabase.from("resource_companies").delete().eq("id", c.id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else void refetch();
  };

  /* ---------------- compensation ---------------- */

  const openCompDialog = (r?: ResourceCompensation) => {
    if (r) {
      setCompDialog({ open: true, id: r.id });
      setCompDraft({
        role_title: r.role_title,
        base_range: r.base_range ?? "",
        bonus_range: r.bonus_range ?? "",
        equity_range: r.equity_range ?? "",
        total_range: r.total_range ?? "",
        notes: r.notes ?? "",
      });
    } else {
      setCompDialog({ open: true, id: null });
      setCompDraft(emptyCompensation);
    }
  };

  const saveCompensation = async () => {
    if (!compDraft.role_title.trim()) {
      toast({ title: "Role title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      role_title: compDraft.role_title.trim(),
      base_range: compDraft.base_range.trim() || null,
      bonus_range: compDraft.bonus_range.trim() || null,
      equity_range: compDraft.equity_range.trim() || null,
      total_range: compDraft.total_range.trim() || null,
      notes: compDraft.notes.trim() || null,
    };
    const { error } = compDialog.id
      ? await supabase.from("resource_compensation").update(payload).eq("id", compDialog.id)
      : await supabase
          .from("resource_compensation")
          .insert({ ...payload, position: compensation.length });
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setCompDialog({ open: false, id: null });
    toast({ title: compDialog.id ? "Entry updated" : "Entry added" });
    void refetch();
  };

  const deleteCompensation = async (r: ResourceCompensation) => {
    if (!window.confirm(`Delete "${r.role_title}"?`)) return;
    await supabase.from("course_resource_picks").delete().eq("resource_type", "compensation").eq("resource_id", r.id);
    await supabase.from("resource_links").delete().eq("resource_id", r.id);
    await supabase.from("resource_files").delete().eq("resource_id", r.id);
    const { error } = await supabase.from("resource_compensation").delete().eq("id", r.id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else void refetch();
  };

  /* ---------------- shared: reorder, links, files ---------------- */

  const move = async (table: "resource_companies" | "resource_compensation", index: number, delta: number, list: { id: string }[]) => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const a = list[index];
    const b = list[target];
    await Promise.all([
      supabase.from(table).update({ position: target } as any).eq("id", a.id),
      supabase.from(table).update({ position: index } as any).eq("id", b.id),
    ]);
    void refetch();
  };

  const addLink = async () => {
    if (!attachFor || !linkLabel.trim() || !linkUrl.trim()) return;
    const { error } = await supabase.from("resource_links").insert({
      resource_type: attachFor.kind,
      resource_id: attachFor.id,
      label: linkLabel.trim(),
      url: linkUrl.trim(),
    } as any);
    if (error) toast({ title: "Could not add link", description: error.message, variant: "destructive" });
    else {
      setLinkLabel("");
      setLinkUrl("");
      void refetch();
    }
  };

  const deleteLink = async (id: string) => {
    await supabase.from("resource_links").delete().eq("id", id);
    void refetch();
  };

  const uploadFile = async (file: File) => {
    if (!attachFor) return;
    setUploading(true);
    const path = `resources/${attachFor.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage
      .from("course-materials")
      .upload(path, file);
    if (uploadError) {
      setUploading(false);
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("resource_files").insert({
      resource_type: attachFor.kind,
      resource_id: attachFor.id,
      file_name: file.name,
      storage_path: path,
    } as any);
    setUploading(false);
    if (error) toast({ title: "Could not attach file", description: error.message, variant: "destructive" });
    else void refetch();
  };

  const deleteFile = async (id: string, storagePath: string) => {
    await supabase.storage.from("course-materials").remove([storagePath]);
    await supabase.from("resource_files").delete().eq("id", id);
    void refetch();
  };

  const attachPanel = attachFor && (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-sm">
          Links & files — {attachFor.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {linksFor(attachFor.id).map((l) => (
            <Badge key={l.id} variant="secondary" className="gap-1.5">
              <ExternalLink className="h-3 w-3" /> {l.label}
              <button onClick={() => void deleteLink(l.id)} aria-label="Remove link">
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            </Badge>
          ))}
          {filesFor(attachFor.id).map((f) => (
            <Badge key={f.id} variant="secondary" className="gap-1.5">
              <FileText className="h-3 w-3" /> {f.file_name}
              <button onClick={() => void deleteFile(f.id, f.storage_path)} aria-label="Remove file">
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            </Badge>
          ))}
          {linksFor(attachFor.id).length === 0 && filesFor(attachFor.id).length === 0 && (
            <p className="text-xs text-muted-foreground">Nothing attached yet.</p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            className="w-40"
            placeholder="Link label"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
          />
          <Input
            className="w-64"
            placeholder="https://…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
          <Button size="sm" variant="outline" onClick={() => void addLink()}>
            Add link
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload file
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading resources…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Resources</h1>
        <p className="text-sm text-muted-foreground">
          Global library for the skilling pathway. Professors pick from these entries for their
          courses; students see what their professor picked.
        </p>
      </div>

      <Tabs defaultValue="companies">
        <TabsList>
          <TabsTrigger value="companies" className="gap-2">
            <Building2 className="h-4 w-4" /> Companies ({companies.length})
          </TabsTrigger>
          <TabsTrigger value="compensation" className="gap-2">
            <IndianRupee className="h-4 w-4" /> Compensation ({compensation.length})
          </TabsTrigger>
          <TabsTrigger value="matrix" className="gap-2">
            <IndianRupee className="h-4 w-4" /> Salary matrix
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix">
          <CompMatrixAdmin />
        </TabsContent>

        <TabsContent value="companies" className="space-y-3 pt-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-2" onClick={() => openCompanyDialog()}>
              <Plus className="h-4 w-4" /> Add company
            </Button>
          </div>
          {companies.map((c, i) => (
            <Card key={c.id}>
              <CardContent className="flex items-center gap-3 py-3">
                <span
                  className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg text-sm font-bold text-white ${c.logo_color ?? "bg-primary"}`}
                >
                  {c.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{c.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {TIER_LABELS[c.tier]}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.pay_range, c.roles.join(", ")].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => void move("resource_companies", i, -1, companies)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => void move("resource_companies", i, 1, companies)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setAttachFor(
                      attachFor?.id === c.id ? null : { kind: "company", id: c.id, label: c.name },
                    )
                  }
                >
                  Links & files
                </Button>
                <Button variant="ghost" size="icon" onClick={() => openCompanyDialog(c)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => void deleteCompany(c)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
          {attachFor?.kind === "company" && attachPanel}
        </TabsContent>

        <TabsContent value="compensation" className="space-y-3 pt-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-2" onClick={() => openCompDialog()}>
              <Plus className="h-4 w-4" /> Add compensation entry
            </Button>
          </div>
          {compensation.map((r, i) => (
            <Card key={r.id}>
              <CardContent className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <IndianRupee className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.role_title}</span>
                  <p className="truncate text-xs text-muted-foreground">
                    {[r.base_range && `Base ${r.base_range}`, r.total_range && `Total ${r.total_range}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => void move("resource_compensation", i, -1, compensation)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => void move("resource_compensation", i, 1, compensation)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setAttachFor(
                      attachFor?.id === r.id
                        ? null
                        : { kind: "compensation", id: r.id, label: r.role_title },
                    )
                  }
                >
                  Links & files
                </Button>
                <Button variant="ghost" size="icon" onClick={() => openCompDialog(r)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => void deleteCompensation(r)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
          {attachFor?.kind === "compensation" && attachPanel}
        </TabsContent>
      </Tabs>

      {/* Company dialog */}
      <Dialog open={companyDialog.open} onOpenChange={(open) => setCompanyDialog({ open, id: null })}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{companyDialog.id ? "Edit company" : "Add company"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Company name"
              value={companyDraft.name}
              onChange={(e) => setCompanyDraft({ ...companyDraft, name: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                value={companyDraft.tier}
                onValueChange={(v) => setCompanyDraft({ ...companyDraft, tier: v as ResourceTier })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tier_1">Tier-1</SelectItem>
                  <SelectItem value="mid_tier">Mid-tier</SelectItem>
                  <SelectItem value="startup">Startup</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Pay range (e.g. ₹45–90 LPA)"
                value={companyDraft.pay_range}
                onChange={(e) => setCompanyDraft({ ...companyDraft, pay_range: e.target.value })}
              />
            </div>
            <Input
              placeholder="Role tags, comma-separated (e.g. SDE, ML, DS)"
              value={companyDraft.roles}
              onChange={(e) => setCompanyDraft({ ...companyDraft, roles: e.target.value })}
            />
            <Textarea
              placeholder="About the company (shown to students — start with what the company does)"
              rows={4}
              value={companyDraft.about}
              onChange={(e) => setCompanyDraft({ ...companyDraft, about: e.target.value })}
            />
            <Textarea
              placeholder="Short summary (one line, internal/fallback)"
              rows={2}
              value={companyDraft.description}
              onChange={(e) => setCompanyDraft({ ...companyDraft, description: e.target.value })}
            />
            <Input
              placeholder="Typical interview pattern (e.g. OA + 2 coding rounds + behavioral)"
              value={companyDraft.interview_format}
              onChange={(e) => setCompanyDraft({ ...companyDraft, interview_format: e.target.value })}
            />
            <Textarea
              placeholder="Rounds — one per line, shown as a numbered list"
              rows={4}
              value={companyDraft.rounds}
              onChange={(e) => setCompanyDraft({ ...companyDraft, rounds: e.target.value })}
            />
            <Textarea
              placeholder="What they look for"
              rows={3}
              value={companyDraft.look_for}
              onChange={(e) => setCompanyDraft({ ...companyDraft, look_for: e.target.value })}
            />
            <Textarea
              placeholder="Pro tip"
              rows={2}
              value={companyDraft.pro_tip}
              onChange={(e) => setCompanyDraft({ ...companyDraft, pro_tip: e.target.value })}
            />
            <Input
              placeholder="Sources (e.g. Levels.fyi, Glassdoor)"
              value={companyDraft.sources}
              onChange={(e) => setCompanyDraft({ ...companyDraft, sources: e.target.value })}
            />
            <Textarea
              placeholder="What they focus on"
              rows={2}
              value={companyDraft.focus_areas}
              onChange={(e) => setCompanyDraft({ ...companyDraft, focus_areas: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="number"
                step="0.5"
                min={0}
                max={4}
                placeholder="DSA difficulty (0–4)"
                value={companyDraft.dsa_difficulty}
                onChange={(e) => setCompanyDraft({ ...companyDraft, dsa_difficulty: e.target.value })}
              />
              <Input
                placeholder="Locations"
                value={companyDraft.locations}
                onChange={(e) => setCompanyDraft({ ...companyDraft, locations: e.target.value })}
              />
            </div>
            <Input
              placeholder="Careers page URL"
              value={companyDraft.apply_url}
              onChange={(e) => setCompanyDraft({ ...companyDraft, apply_url: e.target.value })}
            />
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Logo tile colour</p>
              <div className="flex flex-wrap gap-2">
                {LOGO_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setCompanyDraft({ ...companyDraft, logo_color: color })}
                    className={`h-7 w-7 rounded-md ${color} ${companyDraft.logo_color === color ? "ring-2 ring-ring ring-offset-2" : ""}`}
                    aria-label={color}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCompanyDialog({ open: false, id: null })}>
                Cancel
              </Button>
              <Button onClick={() => void saveCompany()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Compensation dialog */}
      <Dialog open={compDialog.open} onOpenChange={(open) => setCompDialog({ open, id: null })}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{compDialog.id ? "Edit compensation entry" : "Add compensation entry"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Role title (e.g. Software Engineer — Tier-1 product)"
              value={compDraft.role_title}
              onChange={(e) => setCompDraft({ ...compDraft, role_title: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Base range"
                value={compDraft.base_range}
                onChange={(e) => setCompDraft({ ...compDraft, base_range: e.target.value })}
              />
              <Input
                placeholder="Bonus range"
                value={compDraft.bonus_range}
                onChange={(e) => setCompDraft({ ...compDraft, bonus_range: e.target.value })}
              />
              <Input
                placeholder="Equity range"
                value={compDraft.equity_range}
                onChange={(e) => setCompDraft({ ...compDraft, equity_range: e.target.value })}
              />
              <Input
                placeholder="Total range"
                value={compDraft.total_range}
                onChange={(e) => setCompDraft({ ...compDraft, total_range: e.target.value })}
              />
            </div>
            <Textarea
              placeholder="Notes"
              rows={3}
              value={compDraft.notes}
              onChange={(e) => setCompDraft({ ...compDraft, notes: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCompDialog({ open: false, id: null })}>
                Cancel
              </Button>
              <Button onClick={() => void saveCompensation()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminResources;
