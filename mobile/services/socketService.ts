/**
 * AQOND Socket.io Client — Real-time bidding notifications
 * ใช้ getBackendBase() จาก api.ts — หน้า https://app.aqond.com จะได้ wss ไป api.aqond.com
 * (ห้ามอ่าน VITE_BACKEND_URL ตรงๆ เพราะถ้า build ด้วย http://IP:3001 จะโดน Mixed Content บล็อก ws://)
 */
import { io } from 'socket.io-client';
import { getBackendBase } from './api';

let socket: ReturnType<typeof io> | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(getBackendBase(), {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return socket;
}

export function joinBiddingRooms(userId: string) {
  const s = getSocket();
  s.emit('join', { userId, role: null });
}

export function onNewBidReceived(cb: (data: { bid: any; offer_id: string }) => void) {
  getSocket().on('new_bid_received', cb);
}

export function onBidAccepted(cb: (data: { bid_id: string; booking_id: string }) => void) {
  getSocket().on('bid_accepted', cb);
}

export function onMyBidAccepted(cb: (data: { bid_id: string; booking_id: string }) => void) {
  getSocket().on('my_bid_accepted', cb);
}

/** Outbid: คุณโดนแซงแล้วนะ! — กระตุ้นให้บิดสูงขึ้น */
export function onOutbid(cb: (data: { offer_id: string; new_high_amount: number; your_previous_amount: number; message: string }) => void) {
  getSocket().on('outbid', cb);
}

export function offNewBidReceived() {
  getSocket().off('new_bid_received');
}
