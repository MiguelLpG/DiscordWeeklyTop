import { Schema, model, Document } from 'mongoose';

interface IMessageCount extends Document {
    userId: string;
    count: number;
    voiceTime: number; // tiempo en segundos
    week: number;
    year: number;
}

const messageCountSchema = new Schema<IMessageCount>({
    userId: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    voiceTime: { type: Number, required: true, default: 0 },
    week: { type: Number, required: true },
    year: { type: Number, required: true },
});

export const MessageCount = model<IMessageCount>('MessageCount', messageCountSchema);
