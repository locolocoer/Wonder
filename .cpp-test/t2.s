.text
.globl main
main:
  push %rbp
  movq %rsp, %rbp
  movl $2, %eax
  push %rax
  movl $3, %eax
  push %rax
  movl $4, %eax
  movl %eax, %edi
  pop %rax
  imull %edi, %eax
  movl %eax, %edi
  pop %rax
  addl %edi, %eax
  jmp .L.return
.L.return:
  movq %rbp, %rsp
  pop %rbp
  ret
