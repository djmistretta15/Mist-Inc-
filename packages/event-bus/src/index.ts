import { createClient, RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { Event, EventType } from '@mist/types';

const STREAM_NAME = 'mist:events';
const CONSUMER_GROUP = 'mist:consumers';

export class EventBus {
  private client: RedisClientType;
  private publisher: RedisClientType;
  private subscribers: Map<EventType, Set<(event: Event) => void>>;
  private consumerName: string;
  private isRunning: boolean;

  constructor(redisUrl: string, consumerName?: string) {
    this.client = createClient({ url: redisUrl });
    this.publisher = createClient({ url: redisUrl });
    this.subscribers = new Map();
    this.consumerName = consumerName || `consumer-${uuidv4()}`;
    this.isRunning = false;
  }

  async connect(): Promise<void> {
    await this.client.connect();
    await this.publisher.connect();

    // Create consumer group if it doesn't exist
    try {
      await this.client.xGroupCreate(STREAM_NAME, CONSUMER_GROUP, '0', {
        MKSTREAM: true
      });
    } catch (err: any) {
      if (!err.message.includes('BUSYGROUP')) {
        throw err;
      }
    }

    console.log(`EventBus connected: ${this.consumerName}`);
  }

  async disconnect(): Promise<void> {
    this.isRunning = false;
    await this.client.quit();
    await this.publisher.quit();
  }

  /**
   * Publish an event to the event bus
   */
  async publish(event: Omit<Event, 'id' | 'timestamp'>): Promise<string> {
    const fullEvent: Event = {
      id: uuidv4(),
      timestamp: new Date(),
      ...event
    };

    const eventId = await this.publisher.xAdd(
      STREAM_NAME,
      '*',
      {
        id: fullEvent.id,
        timestamp: fullEvent.timestamp.toISOString(),
        source: fullEvent.source,
        type: fullEvent.type,
        actor_id: fullEvent.actor_id || '',
        resource_id: fullEvent.resource_id || '',
        data: JSON.stringify(fullEvent.data)
      },
      { TRIM: { strategy: 'MAXLEN', threshold: 10000, strategyModifier: '~' } }
    );

    return fullEvent.id;
  }

  /**
   * Subscribe to specific event types
   */
  on(eventType: EventType, handler: (event: Event) => void): void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(handler);
  }

  /**
   * Subscribe to all events
   */
  onAny(handler: (event: Event) => void): void {
    Object.values(EventType).forEach(eventType => {
      this.on(eventType as EventType, handler);
    });
  }

  /**
   * Start consuming events from the stream
   */
  async startConsuming(): Promise<void> {
    this.isRunning = true;

    while (this.isRunning) {
      try {
        const messages = await this.client.xReadGroup(
          CONSUMER_GROUP,
          this.consumerName,
          [{ key: STREAM_NAME, id: '>' }],
          {
            COUNT: 10,
            BLOCK: 5000
          }
        );

        if (!messages || messages.length === 0) {
          continue;
        }

        for (const stream of messages) {
          for (const message of stream.messages) {
            await this.processMessage(message.id, message.message as Record<string, string>);
          }
        }
      } catch (err) {
        console.error('Error consuming events:', err);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Process a single message from the stream
   */
  private async processMessage(messageId: string, message: Record<string, string>): Promise<void> {
    try {
      const event: Event = {
        id: message.id,
        timestamp: new Date(message.timestamp),
        source: message.source,
        type: message.type as EventType,
        actor_id: message.actor_id || undefined,
        resource_id: message.resource_id || undefined,
        data: JSON.parse(message.data)
      };

      // Dispatch to subscribers
      const handlers = this.subscribers.get(event.type);
      if (handlers) {
        for (const handler of handlers) {
          try {
            await handler(event);
          } catch (err) {
            console.error(`Error in event handler for ${event.type}:`, err);
          }
        }
      }

      // Acknowledge the message
      await this.client.xAck(STREAM_NAME, CONSUMER_GROUP, messageId);
    } catch (err) {
      console.error('Error processing message:', err);
      // Don't ACK - message will be redelivered
    }
  }

  /**
   * Get pending events for this consumer
   */
  async getPending(): Promise<number> {
    const pending = await this.client.xPending(STREAM_NAME, CONSUMER_GROUP);
    return pending.pending;
  }

  /**
   * Claim abandoned messages (from dead consumers)
   */
  async claimAbandoned(minIdleTime: number = 60000): Promise<void> {
    const pending = await this.client.xPending(STREAM_NAME, CONSUMER_GROUP, '-', '+', 100);

    for (const msg of pending.messages) {
      if (msg.millisecondsSinceLastDelivery >= minIdleTime) {
        const claimed = await this.client.xClaim(
          STREAM_NAME,
          CONSUMER_GROUP,
          this.consumerName,
          minIdleTime,
          [msg.id]
        );

        for (const claimedMsg of claimed.messages) {
          await this.processMessage(claimedMsg.id, claimedMsg.message as Record<string, string>);
        }
      }
    }
  }
}

export default EventBus;
