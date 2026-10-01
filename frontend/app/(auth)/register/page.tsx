'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { authApi } from '@/lib/api';
import { useEffect, useState } from 'react';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['admin', 'manager', 'agent']),
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<string>('agent');
  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'agent' },
  });

  useEffect(() => {
    async function setup() {
      const tokenRes = await fetch('/api/auth/token');
      if (tokenRes.ok) {
        const { token } = await tokenRes.json();
        if (token) {
          const { setAuthToken } = await import('@/lib/api');
          setAuthToken(token);
        }
      }
    }
    setup();
  }, []);

  const onSubmit = async (data: FormData) => {
    try {
      await authApi.register({ ...data, role });
      toast.success('User registered');
      router.push('/dashboard');
    } catch {
      toast.error('Registration failed');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Register User</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...register('name')} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" {...register('email')} />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" {...register('password')} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => { setRole(v); setValue('role', v as FormData['role']); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>Register</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
