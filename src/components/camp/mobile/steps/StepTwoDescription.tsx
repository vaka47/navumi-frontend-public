import { useState } from 'react';
//import { ExpandingTextarea } from '@/components/camp/CreateCampModal';

interface Props {
    formData: FormData;
    setFormData: (data: FormData) => void;
    onBack: () => void;
    onNext: () => void;
    //title: string;
}

export default function StepTwoDescription({ formData, setFormData, onBack, onNext }: Props) {
    const [description, setDescription] = useState(() => formData.get('description')?.toString() || '');

    const handleDescriptionChange = (val: string) => {
        setDescription(val);
        formData.set('description', val);
        setFormData(formData);
    };


    const handleNext = () => {
        if (!description.trim()) {
            alert('Пожалуйста, опишите ваш кэмп.');
            return;
        }

        onNext(); // уже всё сохранено в formData
    };


    return (
        <div className="flex flex-col h-full">
            <div className="pt-2 px-4 pb-4 flex-1">
                <label className="text-sm text-gray-500 mb-2 block">
                    Опишите ваш будущий кэмп: локация, тренеры, расписание, проживание...
                </label>
                <ExpandingTextareaWrapper value={description} onChange={handleDescriptionChange} />
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 flex justify-between">
                <button
                    onClick={onBack}
                    className="bg-gray-100 text-gray-800 px-4 py-2 rounded-full font-medium text-sm w-[48%]"
                >
                    Назад
                </button>
                <button
                    onClick={handleNext}
                    className="bg-black text-white px-4 py-2 rounded-full font-semibold text-sm w-[48%]"
                >
                    Далее
                </button>
            </div>

        </div>
    );
}

function ExpandingTextareaWrapper({ value, onChange }: { value: string; onChange: (val: string) => void }) {
    return (
        <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="..."
            className="w-full h-[360px] border border-gray-300 px-2 py-2 text-sm rounded-md shadow-sm focus:outline-none"
        />
    );
}
