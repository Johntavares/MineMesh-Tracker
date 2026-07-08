'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'

export async function getUsers() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        // password is intentionally excluded
      }
    })
    return { success: true, data: users }
  } catch (error) {
    console.error('Failed to get users:', error)
    return { success: false, error: 'Failed to fetch users' }
  }
}

export async function createUser(data: any) {
  try {
    const { name, email, password, role } = data
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role || 'OPERATOR',
      }
    })
    
    revalidatePath('/[lang]/(dashboard)/users', 'page')
    
    // Exclude password from the response
    const { password: _, ...userWithoutPassword } = user
    return { success: true, data: userWithoutPassword }
  } catch (error: any) {
    console.error('Failed to create user:', error)
    if (error.code === 'P2002') {
      return { success: false, error: 'Email already exists' }
    }
    return { success: false, error: 'Failed to create user' }
  }
}

export async function updateUser(id: string, data: any) {
  try {
    const { name, email, password, role } = data
    
    const updateData: any = {
      name,
      email,
      role
    }

    if (password) {
      updateData.password = await bcrypt.hash(password, 10)
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData
    })
    
    revalidatePath('/[lang]/(dashboard)/users', 'page')
    
    const { password: _, ...userWithoutPassword } = user
    return { success: true, data: userWithoutPassword }
  } catch (error: any) {
    console.error('Failed to update user:', error)
    if (error.code === 'P2002') {
      return { success: false, error: 'Email already exists' }
    }
    return { success: false, error: 'Failed to update user' }
  }
}

export async function deleteUser(id: string) {
  try {
    await prisma.user.delete({
      where: { id }
    })
    
    revalidatePath('/[lang]/(dashboard)/users', 'page')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete user:', error)
    return { success: false, error: 'Failed to delete user' }
  }
}
