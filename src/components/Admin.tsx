import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    return <div className="text-center py-20 text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="text-4xl font-black uppercase tracking-tighter text-foreground">Admin</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage users, credits, and HuggingFace API keys.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-2 border-foreground">
          <div className="p-5 border-b-2 md:border-b-2 md:border-r-2 border-foreground">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Total generations</div>
            <div className="text-4xl font-black tabular-nums mt-2 text-foreground">{stats.totalGenerations}</div>
          </div>
          <div className="p-5 border-b-2 md:border-b-0 md:border-r-2 border-foreground">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Today</div>
            <div className="text-4xl font-black tabular-nums mt-2 text-foreground">{stats.todayGenerations}</div>
          </div>
          <div className="p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Active keys</div>
            <div className="text-4xl font-black tabular-nums mt-2 text-foreground">
              {stats.keyUsage?.filter((k: any) => k.is_active).length || 0}
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Adjust user credit balance. Negative amount deducts.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_160px] gap-3">
            <div className="space-y-2">
              <Label htmlFor="user-select">User</Label>
              <Select
                id="user-select"
                value={creditUserId}
                onChange={(e) => setCreditUserId(e.target.value)}
              >
                <option value="">Choose user</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email} (balance {u.balance})
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                value={creditAmount}
                onChange={(e) => setCreditAmount(Number(e.target.value))}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={addCredits} className="w-full">Apply</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>HuggingFace tokens used to call the Krea-2 Space.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_160px] gap-3">
            <div className="space-y-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="prod-1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-value">Token</Label>
              <Input
                id="key-value"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder="hf_..."
              />
            </div>
            <div className="flex items-end">
              <Button onClick={addKey} className="w-full">Add key</Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Limit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-bold">{k.name}</TableCell>
                  <TableCell className="font-mono text-xs">{k.key}</TableCell>
                  <TableCell className="text-right tabular-nums">{k.used_today}</TableCell>
                  <TableCell className="text-right tabular-nums">{k.daily_limit}</TableCell>
                  <TableCell>
                    <Badge variant={k.is_active ? "default" : "destructive"}>
                      {k.is_active ? "active" : "inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => resetKey(k.id)}>
                      Reset
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => deleteKey(k.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
