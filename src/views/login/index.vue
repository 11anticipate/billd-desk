<template>
  <div class="login-wrap">
    <div class="logo"></div>
    <div class="title">{{ PRODUCT_NAME }}</div>
    <div class="subtitle">登录以绑定这台设备</div>
    <div class="form">
      <div class="ipt-wrap">
        <input
          v-model="id"
          class="ipt"
          type="text"
          inputmode="numeric"
          placeholder="用户 ID（数字）"
          @keyup.enter="handleLogin"
        />
      </div>
      <div class="ipt-wrap">
        <input
          v-model="password"
          class="ipt"
          type="password"
          placeholder="密码"
          @keyup.enter="handleLogin"
        />
      </div>
      <div
        class="btn"
        :class="{ disabled: loading }"
        @click="handleLogin"
      >
        {{ loading ? '登录中…' : '登录' }}
      </div>
      <div
        class="msg"
        :class="{ error: !!errorMsg }"
      >
        {{ errorMsg }}
      </div>
    </div>
    <div class="tip">
      官方服务器已要求登录后才能创建设备代码。<br />
      忘记密码可在官网 desk.hsslive.cn 找回。
    </div>
  </div>
</template>

<script lang="ts" setup>
import { nextTick, ref } from 'vue';

import { fetchLogin } from '@/api/user';
import { PRODUCT_NAME } from '@/constant';
import { usePiniaCacheStore } from '@/store/cache';
import { useUserStore } from '@/store/user';

const userStore = useUserStore();
const cacheStore = usePiniaCacheStore();

const id = ref('');
const password = ref('');
const errorMsg = ref('');
const loading = ref(false);

async function handleLogin() {
  if (loading.value) return;
  const userId = Number(id.value.trim());
  if (!Number.isInteger(userId)) {
    errorMsg.value = '请输入数字用户 ID';
    return;
  }
  if (!password.value) {
    errorMsg.value = '请输入密码';
    return;
  }
  errorMsg.value = '';
  loading.value = true;
  try {
    // Called directly rather than through userStore.pwdLogin so the server's
    // own message ("账号或密码错误！" etc.) can be shown next to the form.
    // pwdLogin swallows it and returns null.
    const res = await fetchLogin({ id: userId, password: password.value });
    userStore.setToken(res.data, 24);
  } catch (error: any) {
    loading.value = false;
    errorMsg.value = error?.message || '登录失败';
    return;
  }
  loading.value = false;
  cacheStore.deskUserUuid = '';
  cacheStore.deskUserPassword = '';
  cacheStore.remoteDeskUserUuid = '';
  cacheStore.remoteDeskUserPassword = '';
  await nextTick();
  window.location.hash = '#/';
  window.location.reload();
}
</script>

<style lang="scss" scoped>
.login-wrap {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100vw;
  min-height: 100vh;
  padding: 40px 30px;
  color: #666;
  font-size: 14px;

  .logo {
    width: 72px;
    height: 72px;
    border-radius: 10px;

    @include setBackground('@/assets/img/logo.png');
  }
  .title {
    margin-top: 12px;
    font-size: 20px;
    font-weight: 600;
    color: #333;
  }
  .subtitle {
    margin: 6px 0 24px;
    font-size: 13px;
  }
  .form {
    width: 100%;
    max-width: 300px;
  }
  .ipt-wrap {
    margin-bottom: 12px;
  }
  .ipt {
    box-sizing: border-box;
    width: 100%;
    height: 40px;
    padding: 0 12px;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    outline: none;
    font-size: 14px;

    &:focus {
      border-color: #409eff;
    }
  }
  .btn {
    height: 40px;
    margin-top: 4px;
    border-radius: 6px;
    background: #409eff;
    color: #fff;
    line-height: 40px;
    text-align: center;
    cursor: pointer;
    user-select: none;

    &.disabled {
      background: #a0cfff;
      cursor: not-allowed;
    }
  }
  .msg {
    min-height: 20px;
    margin-top: 8px;
    font-size: 12px;
    text-align: center;

    &.error {
      color: #f56c6c;
    }
  }
  .tip {
    margin-top: 28px;
    color: #999;
    font-size: 12px;
    line-height: 1.7;
    text-align: center;
  }
}
</style>
