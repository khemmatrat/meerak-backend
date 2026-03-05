// src/controllers/webhook.controller.ts - Webhook Handler Controller
import { Request, Response } from 'express';
import promptPayService from '../services/promptpay.service';
import stripeService from '../services/stripe.service';
import trueMoneyService from '../services/truemoney.service';

class WebhookController {
  
  /**
   * Handle Omise webhook (PromptPay & TrueMoney)
   */
  async handleOmiseWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Get signature from header
      const signature = req.headers['x-omise-signature'] as string;
      
      if (!signature) {
        res.status(401).json({ error: 'Missing signature' });
        return;
      }

      // Verify signature
      const payload = JSON.stringify(req.body);
      const isValid = promptPayService.verifyWebhookSignature(payload, signature);

      if (!isValid) {
        console.error('Invalid Omise webhook signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      // Check idempotency (prevent duplicate processing)
      const webhookId = req.body.id;
      const isProcessed = await this.checkWebhookProcessed(webhookId);
      
      if (isProcessed) {
        console.log('Webhook already processed:', webhookId);
        res.json({ status: 'already_processed' });
        return;
      }

      // Process event
      const event = req.body;
      console.log('Omise webhook event:', event.key);

      switch (event.key) {
        case 'charge.complete':
          await this.handleChargeComplete(event.data);
          break;

        case 'charge.failed':
          await this.handleChargeFailed(event.data);
          break;

        case 'charge.expired':
          await this.handleChargeExpired(event.data);
          break;

        default:
          console.log('Unhandled Omise webhook event:', event.key);
      }

      // Mark as processed
      await this.markWebhookProcessed(webhookId);

      res.json({ received: true });
    } catch (error: any) {
      console.error('Omise webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  /**
   * Handle Stripe webhook
   */
  async handleStripeWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['stripe-signature'] as string;

      if (!signature) {
        res.status(401).json({ error: 'Missing signature' });
        return;
      }

      // Verify webhook using Stripe SDK
      const payload = req.body;
      const event = stripeService.verifyWebhookSignature(payload, signature);

      if (!event) {
        console.error('Invalid Stripe webhook signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      // Check idempotency
      const webhookId = event.id;
      const isProcessed = await this.checkWebhookProcessed(webhookId);
      
      if (isProcessed) {
        console.log('Webhook already processed:', webhookId);
        res.json({ status: 'already_processed' });
        return;
      }

      // Process event
      console.log('Stripe webhook event:', event.type);

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object);
          break;

        case 'charge.refunded':
          await this.handleChargeRefunded(event.data.object);
          break;

        default:
          console.log('Unhandled Stripe webhook event:', event.type);
      }

      // Mark as processed
      await this.markWebhookProcessed(webhookId);

      res.json({ received: true });
    } catch (error: any) {
      console.error('Stripe webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  /**
   * Handle TrueMoney callback (GET request from redirect)
   */
  async handleTrueMoneyCallback(req: Request, res: Response): Promise<void> {
    try {
      const { payment_id, status } = req.query;

      console.log('TrueMoney callback:', { payment_id, status });

      // Verify payment status with Omise
      if (payment_id && typeof payment_id === 'string') {
        const paymentStatus = await trueMoneyService.checkPaymentStatus(payment_id);
        
        // Redirect to success/failure page
        if (paymentStatus === 'completed') {
          res.redirect(`${process.env.FRONTEND_URL}/payment/success?payment_id=${payment_id}`);
        } else {
          res.redirect(`${process.env.FRONTEND_URL}/payment/failed?payment_id=${payment_id}`);
        }
      } else {
        res.redirect(`${process.env.FRONTEND_URL}/payment/failed`);
      }
    } catch (error: any) {
      console.error('TrueMoney callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/payment/failed`);
    }
  }

  /**
   * Handle charge complete event
   */
  private async handleChargeComplete(charge: any): Promise<void> {
    console.log('Payment completed:', charge.id);
    
    // TODO: Update database
    // 1. Update payment status to 'completed'
    // 2. Create ledger entries
    // 3. Update job status
    // 4. Send notification to user
    
    // Example:
    // await db.payments.update({ id: charge.id, status: 'completed' });
    // await ledgerService.createEntries({ ... });
    // await notificationService.send({ ... });
  }

  /**
   * Handle charge failed event
   */
  private async handleChargeFailed(charge: any): Promise<void> {
    console.log('Payment failed:', charge.id);
    
    // TODO: Update database
    // 1. Update payment status to 'failed'
    // 2. Log failure reason
    // 3. Send notification to user
  }

  /**
   * Handle charge expired event
   */
  private async handleChargeExpired(charge: any): Promise<void> {
    console.log('Payment expired:', charge.id);
    
    // TODO: Update database
    // 1. Update payment status to 'expired'
    // 2. Release any holds
    // 3. Send notification to user
  }

  /**
   * Handle Stripe payment intent succeeded
   */
  private async handlePaymentIntentSucceeded(paymentIntent: any): Promise<void> {
    console.log('Stripe payment succeeded:', paymentIntent.id);
    
    // TODO: Same as handleChargeComplete
  }

  /**
   * Handle Stripe payment intent failed
   */
  private async handlePaymentIntentFailed(paymentIntent: any): Promise<void> {
    console.log('Stripe payment failed:', paymentIntent.id);
    
    // TODO: Same as handleChargeFailed
  }

  /**
   * Handle Stripe charge refunded
   */
  private async handleChargeRefunded(charge: any): Promise<void> {
    console.log('Charge refunded:', charge.id);
    
    // TODO: Update database
    // 1. Update payment status to 'refunded'
    // 2. Create ledger entries
    // 3. Update wallet balances
    // 4. Send notification to user
  }

  /**
   * Check if webhook has been processed (idempotency)
   */
  private async checkWebhookProcessed(webhookId: string): Promise<boolean> {
    // TODO: Check Redis or database
    // For now, return false (always process)
    // In production:
    // return await redis.exists(`webhook:${webhookId}`);
    return false;
  }

  /**
   * Mark webhook as processed
   */
  private async markWebhookProcessed(webhookId: string): Promise<void> {
    // TODO: Store in Redis with 24-hour expiry
    // await redis.setex(`webhook:${webhookId}`, 86400, 'processed');
    console.log('Webhook marked as processed:', webhookId);
  }
}

export const webhookController = new WebhookController();
