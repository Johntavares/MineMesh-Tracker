'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Shield, User as UserIcon } from 'lucide-react'
import { getUsers, deleteUser } from '@/app/actions/users'
import { UserFormDialog } from '@/components/users/UserFormDialog'
import { useTranslation } from '@/lib/i18n/client'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const { t } = useTranslation()
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'ADMIN') {
      router.push(`/${params.lang}/dashboard`)
    }
  }, [session, status, router, params.lang])

  const loadUsers = async () => {
    setLoading(true)
    const result = await getUsers()
    if (result.success && result.data) {
      setUsers(result.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const handleCreate = () => {
    setSelectedUser(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (user: any) => {
    setSelectedUser(user)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este usuário?')) {
      const result = await deleteUser(id)
      if (result.success) {
        loadUsers()
      } else {
        alert(result.error || 'Erro ao excluir usuário')
      }
    }
  }

  const handleDialogClose = () => {
    setIsDialogOpen(false)
    loadUsers() // Reload to get fresh data
  }

  if (status === 'loading' || (status === 'authenticated' && session?.user?.role !== 'ADMIN')) {
    return <div className="p-8 text-center text-slate-500">Verificando permissões...</div>
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="flex items-center justify-between mb-4 sm:mb-8">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2">
              <UserIcon className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600" />
              Gerenciamento de Usuários
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Gerencie os acessos ao painel e permissões.
            </p>
          </div>
          <button
            onClick={handleCreate}
            className="hidden md:flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5 mr-2" />
            Novo Usuário
          </button>
        </div>

        {/* Mobile Floating Action Button (FAB) */}
        <button 
          onClick={handleCreate}
          className="md:hidden fixed bottom-20 right-6 z-50 flex items-center justify-center w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg active:scale-95 hover:bg-blue-700 transition-all border border-blue-500/20"
          title="Novo Usuário"
          style={{ bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))' }}
        >
          <Plus className="w-6 h-6 animate-pulse-subtle" />
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
                  <th scope="col" className="px-3 sm:px-6 py-3 sm:py-4 font-medium">Nome</th>
                  <th scope="col" className="px-3 sm:px-6 py-3 sm:py-4 font-medium hidden sm:table-cell">E-mail</th>
                  <th scope="col" className="px-3 sm:px-6 py-3 sm:py-4 font-medium">Nível de Acesso</th>
                  <th scope="col" className="px-3 sm:px-6 py-3 sm:py-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                      Carregando usuários...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 sm:px-6 py-3 sm:py-4 font-medium text-slate-800 text-sm">
                        <div className="flex flex-col">
                          <span>{user.name}</span>
                          <span className="sm:hidden text-xs text-slate-500 font-normal mt-0.5">{user.email}</span>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-slate-500 text-sm hidden sm:table-cell">{user.email}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          user.role === 'ADMIN' 
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {user.role === 'ADMIN' ? <Shield size={12} /> : <UserIcon size={12} />}
                          {user.role === 'ADMIN' ? 'Admin' : 'Operador'}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-right space-x-1">
                        <button
                          onClick={() => handleEdit(user)}
                          className="inline-flex p-2 text-slate-400 hover:text-blue-600 transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="inline-flex p-2 text-slate-400 hover:text-red-600 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <UserFormDialog
          isOpen={isDialogOpen}
          onClose={handleDialogClose}
          user={selectedUser}
        />
      </div>
    </div>
  )
}
