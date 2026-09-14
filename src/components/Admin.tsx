import { useEffect, useState } from "react";
import {
  IconCoins,
  IconKey,
  IconPhoto,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PopSkeleton, SparkStar } from "./graphics";
import { DecoScatter } from "./DecoScatter";

export function Admin() {
  const [users, setUsers] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [creditUserId, setCreditUserId] = useState("");
  const [creditAmount, setCreditAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setError("");
    try {
      const [usersRes, keysRes, statsRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/keys"),
        fetch("/api/admin/stats"),
      ]);

      if (usersRes.ok) setUsers(await usersRes.json());
      if (keysRes.ok) setKeys(await keysRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (!usersRes.ok || !keysRes.ok || !statsRes.ok) {
        setError("Часть данных не загрузилась. Попробуйте обновить.");
      }
    } catch (err) {
      console.error("Failed to load admin data:", err);
      setError("Не удалось загрузить данные админки.");
    } finally {
      setLoading(false);
    }
  }

  async function addKey() {
    if (!newKeyName || !newKeyValue) return;

    try {
      const res = await fetch("/api/admin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName, key: newKeyValue }),
      });

      if (res.ok) {
        setNewKeyName("");
        setNewKeyValue("");
        loadData();
      }
    } catch (error) {
      console.error("Failed to add key:", error);
    }
  }

  async function deleteKey(id: string) {
    if (!window.confirm("Удалить ключ? Действие необратимо.")) return;
    try {
      const res = await fetch(`/api/admin/keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Failed to delete key:", error);
    }
  }

  async function addCredits() {
    if (!creditUserId || creditAmount === 0) return;

    try {
      const res = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: creditUserId, amount: creditAmount }),
      });

      if (res.ok) {
        setCreditUserId("");
        setCreditAmount(0);
        loadData();
      }
    } catch (error) {
      console.error("Failed to add credits:", error);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
          Админка
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <PopSkeleton key={i} className="h-32" />
          ))}
        </div>
        <PopSkeleton className="mt-6 h-64" />
      </div>
    );
  }

  const statsCards = stats
    ? [
        { icon: IconPhoto, label: "Всего генераций", value: stats.totalGenerations },
        { icon: IconCoins, label: "Сегодня", value: stats.todayGenerations },
        {
          icon: IconKey,
          label: "Активные ключи",
          value: stats.keyUsage?.filter((k: any) => k.is_active).length || 0,
        },
      ]
    : [];

  return (
    <div className="relative mx-auto max-w-5xl">
      <DecoScatter />
      <div className="animate-pop-in">
        <div className="flex items-center gap-2.5">
          <SparkStar className="h-6 w-6" />
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
            Админка
          </h2>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-6 text-sm text-destructive">
          {error}{" "}
          <button
            type="button"
            onClick={loadData}
            className="rounded-full font-medium underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Попробовать снова
          </button>
        </div>
      )}

      {stats && (
        <div className="animate-pop-in mt-8 grid grid-cols-1 gap-4 [animation-delay:80ms] sm:grid-cols-3">
          {statsCards.map((s) => (
            <div key={s.label} className="pop-card p-6">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                <s.icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
                {s.label}
              </div>
              <div className="mt-3 font-display text-4xl font-extrabold tabular-nums text-foreground">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="animate-pop-in pop-card mt-6 p-6 [animation-delay:140ms] sm:p-8">
        <h3 className="font-display text-xl font-bold text-foreground">Пользователи</h3>

        <div className="mt-6 grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_160px_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="user-select">Пользователь</Label>
            <Select value={creditUserId} onValueChange={setCreditUserId}>
              <SelectTrigger
                id="user-select"
                className="w-full rounded-2xl border-border bg-secondary/60"
                title={(() => {
                  const u = users.find((x) => x.id === creditUserId);
                  return u ? `${u.email} (баланс ${u.balance})` : undefined;
                })()}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                position="popper"
                side="bottom"
                align="start"
                className="w-[var(--radix-select-trigger-width)]"
              >
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.email} (баланс {u.balance})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="amount">Количество</Label>
            <Input
              id="amount"
              type="number"
              value={creditAmount}
              onChange={(e) => setCreditAmount(Number(e.target.value))}
            />
          </div>
          <Button onClick={addCredits}>Применить</Button>
        </div>
      </section>

      <section className="animate-pop-in pop-card mt-6 p-6 [animation-delay:200ms] sm:p-8">
        <h3 className="font-display text-xl font-bold text-foreground">Ключи генерации</h3>

        <div className="mt-6 grid grid-cols-1 items-end gap-4 sm:grid-cols-[220px_1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="key-name">Название</Label>
            <Input
              id="key-name"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="key-value">Токен</Label>
            <Input
              id="key-value"
              value={newKeyValue}
              onChange={(e) => setNewKeyValue(e.target.value)}
            />
          </div>
          <Button onClick={addKey}>Добавить ключ</Button>
        </div>

        <div className="mt-8 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Ключ</TableHead>
                <TableHead>Квота ZeroGPU</TableHead>
                <TableHead>Сброс</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-semibold">{k.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {k.key}
                  </TableCell>
                  <TableCell>
                    {k.hf_current != null && k.hf_base != null ? (
                      <div className="h-2 w-40 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full transition-all ${
                            k.hf_current / k.hf_base > 0.5
                              ? "bg-primary"
                              : k.hf_current / k.hf_base > 0.2
                                ? "bg-yellow-500"
                                : "bg-destructive"
                          }`}
                          style={{ width: `${Math.min((k.hf_current / k.hf_base) * 100, 100)}%` }}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {k.hf_resets_at
                      ? new Date(k.hf_resets_at).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                      : k.hf_checked_at
                        ? new Date(k.hf_checked_at).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                        : ""}
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button variant="ghost" size="icon" title="Удалить ключ" aria-label="Удалить ключ" onClick={() => deleteKey(k.id)} className="text-destructive hover:text-destructive">
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
