import { useEffect, useState } from "react";
import {
  IconCoins,
  IconKey,
  IconPhoto,
  IconRefresh,
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

export function Admin() {
  const [users, setUsers] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [creditUserId, setCreditUserId] = useState("");
  const [creditAmount, setCreditAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [usersRes, keysRes, statsRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/keys"),
        fetch("/api/admin/stats"),
      ]);

      if (usersRes.ok) setUsers(await usersRes.json());
      if (keysRes.ok) setKeys(await keysRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (error) {
      console.error("Failed to load admin data:", error);
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
    try {
      const res = await fetch(`/api/admin/keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Failed to delete key:", error);
    }
  }

  async function resetKey(id: string) {
    try {
      const res = await fetch(`/api/admin/keys/${id}`, { method: "POST" });
      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Failed to reset key:", error);
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
    return <div className="py-20 text-center text-sm text-muted-foreground">Загрузка…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="animate-develop">
        <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">Админка</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Управление пользователями, кредитами и HuggingFace-ключами.
        </p>
      </div>

      {stats && (
        <div className="animate-develop mt-10 grid grid-cols-1 gap-8 border-y border-border py-8 sm:grid-cols-3 [animation-delay:80ms]">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <IconPhoto className="h-4 w-4 text-primary" strokeWidth={1.75} />
              Всего генераций
            </div>
            <div className="mt-3 font-display text-4xl font-bold tabular-nums text-foreground">{stats.totalGenerations}</div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <IconCoins className="h-4 w-4 text-primary" strokeWidth={1.75} />
              Сегодня
            </div>
            <div className="mt-3 font-display text-4xl font-bold tabular-nums text-foreground">{stats.todayGenerations}</div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <IconKey className="h-4 w-4 text-primary" strokeWidth={1.75} />
              Активные ключи
            </div>
            <div className="mt-3 font-display text-4xl font-bold tabular-nums text-foreground">
              {stats.keyUsage?.filter((k: any) => k.is_active).length || 0}
            </div>
          </div>
        </div>
      )}

      <section className="animate-develop mt-12 [animation-delay:140ms]">
        <h3 className="font-display text-xl font-semibold text-foreground">Пользователи</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Изменяйте баланс кредитов. Отрицательное число списывает.
        </p>

        <div className="mt-6 grid grid-cols-1 items-end gap-6 sm:grid-cols-[1fr_160px_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="user-select">Пользователь</Label>
            <select
              id="user-select"
              value={creditUserId}
              onChange={(e) => setCreditUserId(e.target.value)}
              className="w-full border-0 border-b border-border bg-transparent py-2.5 text-sm text-foreground outline-none transition-colors hover:border-muted-foreground/50 focus-visible:border-primary [&>option]:bg-card"
            >
              <option value="">Выберите пользователя</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email} (баланс {u.balance})
                </option>
              ))}
            </select>
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

      <section className="animate-develop mt-14 [animation-delay:200ms]">
        <h3 className="font-display text-xl font-semibold text-foreground">API-ключи</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Токены HuggingFace для вызова Krea-2 Space.
        </p>

        <div className="mt-6 grid grid-cols-1 items-end gap-6 sm:grid-cols-[220px_1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="key-name">Название</Label>
            <Input
              id="key-name"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="prod-1"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="key-value">Токен</Label>
            <Input
              id="key-value"
              value={newKeyValue}
              onChange={(e) => setNewKeyValue(e.target.value)}
              placeholder="hf_..."
            />
          </div>
          <Button onClick={addKey}>Добавить ключ</Button>
        </div>

        <div className="mt-10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Ключ</TableHead>
                <TableHead className="text-right">Использовано</TableHead>
                <TableHead className="text-right">Лимит</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-semibold">{k.name}</TableCell>
                  <TableCell className="font-mono text-xs">{k.key}</TableCell>
                  <TableCell className="text-right tabular-nums">{k.used_today}</TableCell>
                  <TableCell className="text-right tabular-nums">{k.daily_limit}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${k.is_active ? "bg-primary" : "bg-destructive"}`}
                      />
                      {k.is_active ? "активен" : "неактивен"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" title="Сбросить лимит" onClick={() => resetKey(k.id)}>
                      <IconRefresh className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Удалить ключ" onClick={() => deleteKey(k.id)} className="text-destructive hover:text-destructive">
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
